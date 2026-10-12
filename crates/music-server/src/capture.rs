//! Windows window capture for 识谱: list sounding windows, record a mix to
//! PCM16 WAV. Ported from YuE-studio's `capture.py` (silence / listing rules);
//! recording uses WASAPI process loopback of the chosen window's process tree.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;

pub const SILENCE_PEAK: i32 = 16;
pub const MIN_SECONDS: f64 = 0.3;
pub const SILENCE_NOTE: &str = r#"{"code":"captureSilent"}"#;

#[derive(Debug, Clone, Serialize)]
pub struct CaptureTarget {
    pub pid: u32,
    pub label: String,
    pub process_name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Recording {
    pub path: PathBuf,
    pub pid: u32,
    pub label: String,
    pub process_name: String,
    pub duration: f64,
    pub silent: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureStatus {
    pub recording: bool,
    pub note: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub silent: Option<bool>,
}

#[derive(Debug)]
pub struct CaptureError(pub String);

impl std::fmt::Display for CaptureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CaptureError {}

/// Keep windows on other virtual desktops. Drop app-cloaked windows.
#[cfg(test)]
pub fn window_listed(visible: bool, cloaked: u32) -> bool {
    visible && (cloaked & 0x1) == 0
}

#[cfg(test)]
pub fn on_current_desktop(cloaked: u32) -> bool {
    (cloaked & 0x2) == 0
}

pub fn pcm16_peak(pcm: &[u8]) -> i32 {
    let even = pcm.len() - (pcm.len() % 2);
    if even == 0 {
        return 0;
    }
    let mut peak = 0i32;
    for chunk in pcm[..even].chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as i32;
        let value = sample.unsigned_abs() as i32;
        if value > peak {
            peak = value;
        }
    }
    peak
}

pub fn assess_pcm16(sample_rate: u32, channels: u16, pcm: &[u8]) -> (f64, i32, bool) {
    let width = channels as usize * 2;
    if sample_rate == 0 || channels == 0 || pcm.len() < width {
        return (0.0, 0, true);
    }
    let frames = pcm.len() / width;
    let peak = pcm16_peak(&pcm[..frames * width]);
    (frames as f64 / sample_rate as f64, peak, peak < SILENCE_PEAK)
}

pub fn require_usable(duration: f64, frames: usize) -> Result<(), CaptureError> {
    if frames == 0 || duration < MIN_SECONDS {
        return Err(CaptureError(r#"{"code":"captureTooShort"}"#.into()));
    }
    Ok(())
}

pub fn write_pcm16_wav(path: &Path, sample_rate: u32, channels: u16, pcm: &[u8]) -> Result<(), CaptureError> {
    if sample_rate == 0 || channels == 0 {
        return Err(CaptureError(r#"{"code":"captureWavRate"}"#.into()));
    }
    let width = channels as usize * 2;
    if width == 0 || pcm.len() % width != 0 {
        return Err(CaptureError(r#"{"code":"captureWavAlign"}"#.into()));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CaptureError(e.to_string()))?;
    }
    let mut out = Vec::with_capacity(44 + pcm.len());
    let data_len = pcm.len() as u32;
    let byte_rate = sample_rate * u32::from(channels) * 2;
    let block_align = channels * 2;
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    out.extend_from_slice(pcm);
    std::fs::write(path, out).map_err(|e| CaptureError(e.to_string()))
}

pub fn new_capture_path(root: &Path) -> PathBuf {
    let folder = root.join("_capture");
    let _ = std::fs::create_dir_all(&folder);
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let path = folder.join(format!("capture-{stamp}.wav"));
    if path.exists() {
        folder.join(format!("capture-{stamp}-{}.wav", uuid::Uuid::now_v7().simple()))
    } else {
        path
    }
}

pub struct Recorder {
    inner: Mutex<Inner>,
}

struct Inner {
    thread: Option<std::thread::JoinHandle<Result<Recording, CaptureError>>>,
    stop: Option<Arc<AtomicBool>>,
    started: Option<std::time::Instant>,
    label: String,
    process_name: String,
    pid: u32,
    path: Option<PathBuf>,
    note: String,
}

impl Recorder {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                thread: None,
                stop: None,
                started: None,
                label: String::new(),
                process_name: String::new(),
                pid: 0,
                path: None,
                note: String::new(),
            }),
        }
    }

    pub fn status(&self) -> CaptureStatus {
        let guard = self.inner.lock().expect("capture");
        if guard.thread.is_some() {
            let secs = guard.started.map(|at| at.elapsed().as_secs_f64()).unwrap_or(0.0);
            CaptureStatus {
                recording: true,
                note: serde_json::json!({"code":"captureRecording","label": guard.label, "seconds": format!("{:.0}", secs)}).to_string(),
                path: None,
                duration: Some(secs),
                silent: None,
            }
        } else {
            CaptureStatus {
                recording: false,
                note: guard.note.clone(),
                path: guard.path.clone(),
                duration: None,
                silent: None,
            }
        }
    }

    pub fn start(&self, pid: u32, process_name: &str, label: &str, dest: PathBuf) -> Result<(), CaptureError> {
        if pid == 0 {
            return Err(CaptureError(r#"{"code":"captureNoWindow"}"#.into()));
        }
        #[cfg(not(windows))]
        {
            let _ = (process_name, label, dest);
            return Err(CaptureError(r#"{"code":"captureWindowsOnly"}"#.into()));
        }
        #[cfg(windows)]
        {
            let mut guard = self.inner.lock().expect("capture");
            if guard.thread.as_ref().is_some_and(|t| !t.is_finished()) {
                return Err(CaptureError(r#"{"code":"captureBusy"}"#.into()));
            }
            let stop = Arc::new(AtomicBool::new(false));
            let stop_thread = stop.clone();
            let process_name_owned = process_name.to_owned();
            let label_owned = label.to_owned();
            let path = dest.clone();
            let ready = Arc::new(AtomicBool::new(false));
            let ready_flag = ready.clone();
            let early_error: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
            let early_slot = early_error.clone();
            let handle = std::thread::Builder::new()
                .name("yue-capture".into())
                .spawn(move || {
                    match win::record_loopback(pid, &path, &stop_thread, &ready_flag) {
                        Ok((duration, silent)) => Ok(Recording {
                            path,
                            pid,
                            label: label_owned,
                            process_name: process_name_owned,
                            duration,
                            silent,
                        }),
                        Err(err) => {
                            *early_slot.lock().expect("err") = Some(err.0.clone());
                            Err(err)
                        }
                    }
                })
                .map_err(|e| CaptureError(e.to_string()))?;
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
            while !ready.load(Ordering::Relaxed) && std::time::Instant::now() < deadline {
                if handle.is_finished() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            if let Some(err) = early_error.lock().expect("err").take() {
                let _ = handle.join();
                return Err(CaptureError(err));
            }
            if !ready.load(Ordering::Relaxed) && !handle.is_finished() {
                stop.store(true, Ordering::Relaxed);
                let _ = handle.join();
                return Err(CaptureError(r#"{"code":"captureDeviceTimeout"}"#.into()));
            }
            guard.thread = Some(handle);
            guard.stop = Some(stop);
            guard.started = Some(std::time::Instant::now());
            guard.label = label.to_owned();
            guard.process_name = process_name.to_owned();
            guard.pid = pid;
            guard.path = Some(dest);
            guard.note.clear();
            Ok(())
        }
    }

    pub fn stop(&self) -> Result<Recording, CaptureError> {
        let (handle, stop) = {
            let mut guard = self.inner.lock().expect("capture");
            let handle = guard.thread.take().ok_or_else(|| CaptureError(r#"{"code":"captureNotRecording"}"#.into()))?;
            let stop = guard.stop.take();
            (handle, stop)
        };
        if let Some(stop) = stop {
            stop.store(true, Ordering::Relaxed);
        }
        let recording = handle.join().map_err(|_| CaptureError(r#"{"code":"captureThreadDied"}"#.into()))??;
        require_usable(recording.duration, if recording.duration > 0.0 { 1 } else { 0 })?;
        let mut guard = self.inner.lock().expect("capture");
        // Client builds the finished note from duration + silent.
        guard.note.clear();
        if recording.silent {
            guard.note = SILENCE_NOTE.into();
        }
        guard.path = Some(recording.path.clone());
        guard.started = None;
        Ok(recording)
    }
}

impl Default for Recorder {
    fn default() -> Self {
        Self::new()
    }
}

pub fn list_playing_windows() -> Result<Vec<CaptureTarget>, CaptureError> {
    #[cfg(windows)]
    {
        win::list_playing_windows()
    }
    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

/// One row per window. `value` is `pid:hwnd`. Collapsing by pid kept only the
/// first window of a process, so 刷新 kept showing the same row.
pub fn keep_each_window(targets: Vec<CaptureTarget>) -> Vec<CaptureTarget> {
    let mut seen = std::collections::HashSet::new();
    targets.into_iter().filter(|target| seen.insert(target.value.clone())).collect()
}

/// Fields for `AUDIOCLIENT_ACTIVATION_PARAMS` process loopback (Win32 layout).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProcessLoopbackActivation {
    pub activation_type: i32,
    pub target_process_id: u32,
    pub process_loopback_mode: i32,
}

pub fn process_loopback_activation(pid: u32) -> ProcessLoopbackActivation {
    ProcessLoopbackActivation {
        activation_type: 1, // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
        target_process_id: pid,
        process_loopback_mode: 0, // INCLUDE_TARGET_PROCESS_TREE
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::sync::Condvar;
    use windows::core::{implement, Interface, PROPVARIANT};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::Media::Audio::{
        IActivateAudioInterfaceAsyncOperation, IActivateAudioInterfaceCompletionHandler,
        IActivateAudioInterfaceCompletionHandler_Impl, IAudioCaptureClient, IAudioClient,
        WAVEFORMATEX, AUDIOCLIENT_ACTIVATION_PARAMS, AUDIOCLIENT_ACTIVATION_PARAMS_0,
        AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK, AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
        AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
        AUDCLNT_STREAMFLAGS_EVENTCALLBACK, AUDCLNT_STREAMFLAGS_LOOPBACK,
        PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE, VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
        ActivateAudioInterfaceAsync,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    pub fn list_playing_windows() -> Result<Vec<CaptureTarget>, CaptureError> {
        struct State {
            targets: Vec<CaptureTarget>,
        }
        unsafe extern "system" fn each(hwnd: HWND, lparam: LPARAM) -> windows::Win32::Foundation::BOOL {
            unsafe {
                let state = &mut *(lparam.0 as *mut State);
                if !IsWindowVisible(hwnd).as_bool() {
                    return windows::Win32::Foundation::TRUE;
                }
                let mut title = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut title);
                if len <= 0 {
                    return windows::Win32::Foundation::TRUE;
                }
                let title = String::from_utf16_lossy(&title[..len as usize]).trim().to_owned();
                if title.is_empty() {
                    return windows::Win32::Foundation::TRUE;
                }
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                if pid == 0 {
                    return windows::Win32::Foundation::TRUE;
                }
                let process_name = process_name(pid).unwrap_or_else(|| format!("pid {pid}"));
                state.targets.push(CaptureTarget {
                    pid,
                    label: format!("{title} — {process_name}"),
                    process_name,
                    value: format!("{pid}:{}", hwnd.0 as usize),
                });
                windows::Win32::Foundation::TRUE
            }
        }
        let mut state = State { targets: Vec::new() };
        unsafe {
            let _ = EnumWindows(Some(each), LPARAM(&mut state as *mut State as isize));
        }
        Ok(super::keep_each_window(state.targets))
    }

    fn process_name(pid: u32) -> Option<String> {
        use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
        let mut buf = [0u16; 260];
        let mut size = buf.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut size) };
        let _ = unsafe { CloseHandle(handle) };
        if ok.is_err() || size == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned())
    }

    pub fn record_loopback(pid: u32, path: &Path, stop: &AtomicBool, ready: &AtomicBool) -> Result<(f64, bool), CaptureError> {
        unsafe { record_loopback_inner(pid, path, stop, ready) }
    }

    struct ActivateState {
        done: bool,
        client: Option<IAudioClient>,
        error: Option<String>,
    }

    #[implement(IActivateAudioInterfaceCompletionHandler)]
    struct ActivateHandler {
        shared: Arc<(Mutex<ActivateState>, Condvar)>,
    }

    impl IActivateAudioInterfaceCompletionHandler_Impl for ActivateHandler_Impl {
        fn ActivateCompleted(
            &self,
            activateoperation: Option<&IActivateAudioInterfaceAsyncOperation>,
        ) -> windows::core::Result<()> {
            let (lock, signal) = &*self.shared;
            let mut guard = lock.lock().expect("activate");
            let finish = |guard: &mut ActivateState, client: Option<IAudioClient>, error: Option<String>| {
                guard.client = client;
                guard.error = error;
                guard.done = true;
            };
            let Some(op) = activateoperation else {
                finish(&mut guard, None, Some(r#"{"code":"captureClientFail","detail":"no operation"}"#.into()));
                signal.notify_all();
                return Ok(());
            };
            let mut hr = windows::core::HRESULT(0);
            let mut unknown = None;
            if let Err(err) = unsafe { op.GetActivateResult(&mut hr, &mut unknown) } {
                finish(&mut guard, None, Some(serde_json::json!({"code":"captureClientFail","detail": err.to_string()}).to_string()));
                signal.notify_all();
                return Ok(());
            }
            if hr.is_err() {
                finish(
                    &mut guard,
                    None,
                    Some(serde_json::json!({"code":"captureLoopFail","detail": format!("{hr:?}")}).to_string()),
                );
                signal.notify_all();
                return Ok(());
            }
            let Some(unknown) = unknown else {
                finish(&mut guard, None, Some(r#"{"code":"captureClientFail","detail":"no audio client"}"#.into()));
                signal.notify_all();
                return Ok(());
            };
            match unknown.cast::<IAudioClient>() {
                Ok(client) => finish(&mut guard, Some(client), None),
                Err(err) => finish(
                    &mut guard,
                    None,
                    Some(serde_json::json!({"code":"captureClientFail","detail": err.to_string()}).to_string()),
                ),
            }
            signal.notify_all();
            Ok(())
        }
    }

    unsafe fn open_process_loopback(pid: u32) -> Result<IAudioClient, CaptureError> {
        unsafe {
            let fields = process_loopback_activation(pid);
            let mut activation = AUDIOCLIENT_ACTIVATION_PARAMS {
                ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                    ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                        TargetProcessId: fields.target_process_id,
                        ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
                    },
                },
            };
            debug_assert_eq!(fields.activation_type, AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK.0);
            debug_assert_eq!(fields.process_loopback_mode, PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE.0);

            let mut prop = PROPVARIANT::new();
            // VT_BLOB pointing at stack activation params — clear vt before Drop.
            {
                let inner = &mut *(&mut prop as *mut PROPVARIANT as *mut windows::core::imp::PROPVARIANT);
                inner.Anonymous.Anonymous.vt = 65; // VT_BLOB
                inner.Anonymous.Anonymous.Anonymous.blob = windows::core::imp::BLOB {
                    cbSize: std::mem::size_of_val(&activation) as u32,
                    pBlobData: (&mut activation as *mut AUDIOCLIENT_ACTIVATION_PARAMS).cast(),
                };
            }

            let shared = Arc::new((
                Mutex::new(ActivateState {
                    done: false,
                    client: None,
                    error: None,
                }),
                Condvar::new(),
            ));
            let iface: IActivateAudioInterfaceCompletionHandler = ActivateHandler {
                shared: shared.clone(),
            }
            .into();
            let _op = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                &IAudioClient::IID,
                Some(&prop as *const PROPVARIANT),
                &iface,
            )
            .map_err(|e| CaptureError(serde_json::json!({"code":"captureLoopFail","detail": e.to_string()}).to_string()))?;

            // Activation copies the blob; stop PropVariantClear from freeing stack memory.
            {
                let inner = &mut *(&mut prop as *mut PROPVARIANT as *mut windows::core::imp::PROPVARIANT);
                inner.Anonymous.Anonymous.vt = 0;
            }

            let (lock, signal) = &*shared;
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
            let mut guard = lock.lock().expect("activate");
            while !guard.done {
                let remaining = deadline.saturating_duration_since(std::time::Instant::now());
                if remaining.is_zero() {
                    return Err(CaptureError(r#"{"code":"captureDeviceTimeout"}"#.into()));
                }
                let (next, timeout) = signal.wait_timeout(guard, remaining).expect("activate wait");
                guard = next;
                if timeout.timed_out() && !guard.done {
                    return Err(CaptureError(r#"{"code":"captureDeviceTimeout"}"#.into()));
                }
            }
            if let Some(error) = guard.error.take() {
                return Err(CaptureError(error));
            }
            guard
                .client
                .take()
                .ok_or_else(|| CaptureError(r#"{"code":"captureClientFail","detail":"empty"}"#.into()))
        }
    }

    unsafe fn record_loopback_inner(pid: u32, path: &Path, stop: &AtomicBool, ready: &AtomicBool) -> Result<(f64, bool), CaptureError> {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
            if hr.is_err() && hr.0 as u32 != 0x80010106 {
                return Err(CaptureError(serde_json::json!({"code":"captureInitFail","detail": format!("{hr:?}")}).to_string()));
            }
            struct ComGuard;
            impl Drop for ComGuard {
                fn drop(&mut self) {
                    unsafe { CoUninitialize() };
                }
            }
            let _com = ComGuard;

            let client = open_process_loopback(pid)?;

            // Process loopback has no GetMixFormat; ask for PCM16 like Application Loopback.
            let mut format = WAVEFORMATEX {
                wFormatTag: 1, // WAVE_FORMAT_PCM
                nChannels: 2,
                nSamplesPerSec: 48000,
                nAvgBytesPerSec: 48000 * 4,
                nBlockAlign: 4,
                wBitsPerSample: 16,
                cbSize: 0,
            };
            let flags = AUDCLNT_STREAMFLAGS_LOOPBACK
                | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM;
            let init = |fmt: &WAVEFORMATEX| client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, fmt, None);
            if let Err(first) = init(&format) {
                format.nSamplesPerSec = 44100;
                format.nAvgBytesPerSec = 44100 * 4;
                init(&format).map_err(|e| {
                    CaptureError(
                        serde_json::json!({
                            "code": "captureLoopFail",
                            "detail": format!("{first}; fallback: {e}")
                        })
                        .to_string(),
                    )
                })?;
            }

            let channels = format.nChannels;
            let rate = format.nSamplesPerSec;
            let bits = format.wBitsPerSample;
            let block = format.nBlockAlign as usize;

            let event = CreateEventW(None, false, false, None).map_err(|e| CaptureError(e.to_string()))?;
            client.SetEventHandle(event).map_err(|e| CaptureError(e.to_string()))?;
            let capture: IAudioCaptureClient = client.GetService().map_err(|e| CaptureError(e.to_string()))?;

            client.Start().map_err(|e| CaptureError(serde_json::json!({"code":"captureStartFail","detail": e.to_string()}).to_string()))?;
            ready.store(true, Ordering::Relaxed);

            let mut pcm = Vec::new();
            while !stop.load(Ordering::Relaxed) {
                let _ = WaitForSingleObject(event, 100);
                loop {
                    let packet = match capture.GetNextPacketSize() {
                        Ok(size) => size,
                        Err(_) => break,
                    };
                    if packet == 0 {
                        break;
                    }
                    let mut data = std::ptr::null_mut();
                    let mut frames = 0u32;
                    let mut flags = 0u32;
                    let mut device_pos = 0u64;
                    let mut qpc = 0u64;
                    if capture
                        .GetBuffer(&mut data, &mut frames, &mut flags, Some(&mut device_pos), Some(&mut qpc))
                        .is_err()
                    {
                        break;
                    }
                    if frames > 0 && !data.is_null() && (flags & 0x2) == 0 {
                        let bytes = frames as usize * block;
                        let slice = std::slice::from_raw_parts(data as *const u8, bytes);
                        append_as_pcm16(&mut pcm, slice, bits, channels);
                    }
                    let _ = capture.ReleaseBuffer(frames);
                }
            }
            let _ = client.Stop();
            let _ = CloseHandle(event);

            let (duration, _peak, silent) = assess_pcm16(rate, channels, &pcm);
            let frames = pcm.len() / (channels as usize * 2).max(1);
            require_usable(duration, frames)?;
            write_pcm16_wav(path, rate, channels, &pcm)?;
            Ok((duration, silent))
        }
    }

    fn append_as_pcm16(out: &mut Vec<u8>, raw: &[u8], bits: u16, channels: u16) {
        match bits {
            16 => out.extend_from_slice(raw),
            32 => {
                for chunk in raw.chunks_exact(4) {
                    let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                    let clamped = sample.clamp(-1.0, 1.0);
                    let i = (clamped * 32767.0).round() as i16;
                    out.extend_from_slice(&i.to_le_bytes());
                }
                let _ = channels;
            }
            _ => {
                let frames = raw.len() / ((bits as usize / 8) * channels as usize).max(1);
                out.extend(std::iter::repeat_n(0u8, frames * channels as usize * 2));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_and_window_rules() {
        assert!(window_listed(true, 0));
        assert!(!window_listed(false, 0));
        assert!(!window_listed(true, 0x1));
        assert!(window_listed(true, 0x2));
        assert!(!on_current_desktop(0x2));
        assert_eq!(pcm16_peak(&[0, 0, 10, 0]), 10);
        let (dur, peak, silent) = assess_pcm16(48000, 1, &[0, 0, 0, 0]);
        assert!(silent);
        assert_eq!(peak, 0);
        assert!(dur > 0.0);
        assert!(require_usable(0.1, 10).is_err());
        assert!(require_usable(1.0, 10).is_ok());
    }

    fn target(pid: u32, value: &str, label: &str) -> CaptureTarget {
        CaptureTarget { pid, label: label.into(), process_name: "chrome.exe".into(), value: value.into() }
    }

    #[test]
    fn each_window_of_a_process_stays_in_the_list() {
        let rows = keep_each_window(vec![
            target(1, "1:10", "YuE2 Studio"),
            target(1, "1:11", "YouTube"),
            target(1, "1:10", "YuE2 Studio again"),
            target(2, "2:20", "Cursor"),
        ]);
        assert_eq!(rows.iter().map(|row| row.label.as_str()).collect::<Vec<_>>(), ["YuE2 Studio", "YouTube", "Cursor"]);
    }

    #[test]
    fn process_loopback_activation_targets_the_pid_tree() {
        assert_eq!(
            process_loopback_activation(4242),
            ProcessLoopbackActivation {
                activation_type: 1,
                target_process_id: 4242,
                process_loopback_mode: 0,
            }
        );
    }
}
