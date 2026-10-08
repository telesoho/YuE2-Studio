//! Windows window capture for 识谱: list sounding windows, record a mix to
//! PCM16 WAV. Ported from YuE-studio's `capture.py` (silence / listing rules);
//! recording uses WASAPI loopback of the default render device (play only the
//! chosen app while capturing).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;

pub const SILENCE_PEAK: i32 = 16;
pub const MIN_SECONDS: f64 = 0.3;
pub const SILENCE_NOTE: &str =
    "录音峰值接近静音。这个程序可能禁止回环采集，识谱结果可能没有声音。";

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
pub fn window_listed(visible: bool, cloaked: u32) -> bool {
    visible && (cloaked & 0x1) == 0
}

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
        return Err(CaptureError("录音太短，没有保存。".into()));
    }
    Ok(())
}

pub fn write_pcm16_wav(path: &Path, sample_rate: u32, channels: u16, pcm: &[u8]) -> Result<(), CaptureError> {
    if sample_rate == 0 || channels == 0 {
        return Err(CaptureError("无法写入 WAV：采样率或声道无效。".into()));
    }
    let width = channels as usize * 2;
    if width == 0 || pcm.len() % width != 0 {
        return Err(CaptureError("无法写入 WAV：采样数据长度和声道不一致。".into()));
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
                note: format!("正在录制 {}… {:.0}s", guard.label, secs),
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
            return Err(CaptureError("请选择正在播放的窗口。".into()));
        }
        #[cfg(not(windows))]
        {
            let _ = (process_name, label, dest);
            return Err(CaptureError("窗录仅在 Windows 上可用。".into()));
        }
        #[cfg(windows)]
        {
            let mut guard = self.inner.lock().expect("capture");
            if guard.thread.as_ref().is_some_and(|t| !t.is_finished()) {
                return Err(CaptureError("已经在录音。".into()));
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
                    match win::record_loopback(&path, &stop_thread, &ready_flag) {
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
                return Err(CaptureError("录音设备没有在时限内就绪。".into()));
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
            let handle = guard.thread.take().ok_or_else(|| CaptureError("没有正在进行的录音。".into()))?;
            let stop = guard.stop.take();
            (handle, stop)
        };
        if let Some(stop) = stop {
            stop.store(true, Ordering::Relaxed);
        }
        let recording = handle.join().map_err(|_| CaptureError("录音线程异常结束。".into()))??;
        require_usable(recording.duration, if recording.duration > 0.0 { 1 } else { 0 })?;
        let mut guard = self.inner.lock().expect("capture");
        guard.note = format!("已录制 {:.1} 秒。选择歌词语言后，点「开始识谱」。", recording.duration);
        if recording.silent {
            guard.note = format!("{SILENCE_NOTE}\n{}", guard.note);
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

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::{Interface, GUID};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_EVENTCALLBACK, AUDCLNT_STREAMFLAGS_LOOPBACK,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    // MMDeviceEnumerator — not always re-exported as CLSID_MMDeviceEnumerator.
    const CLSID_MMDEVICE_ENUMERATOR: GUID = GUID::from_u128(0xbcde0395_e52f_467c_8e3d_c4579291692e);

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
                    value: pid.to_string(),
                });
                windows::Win32::Foundation::TRUE
            }
        }
        let mut state = State { targets: Vec::new() };
        unsafe {
            let _ = EnumWindows(Some(each), LPARAM(&mut state as *mut State as isize));
        }
        let mut seen = std::collections::HashSet::new();
        state.targets.retain(|t| seen.insert(t.pid));
        Ok(state.targets)
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

    pub fn record_loopback(path: &Path, stop: &AtomicBool, ready: &AtomicBool) -> Result<(f64, bool), CaptureError> {
        unsafe { record_loopback_inner(path, stop, ready) }.map_err(|e| CaptureError(e.to_string()))
    }

    unsafe fn record_loopback_inner(path: &Path, stop: &AtomicBool, ready: &AtomicBool) -> Result<(f64, bool), CaptureError> {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() && hr.0 as u32 != 0x80010106 {
            return Err(CaptureError(format!("无法初始化录音线程（{hr:?}）。")));
        }
        struct ComGuard;
        impl Drop for ComGuard {
            fn drop(&mut self) {
                unsafe { CoUninitialize() };
            }
        }
        let _com = ComGuard;

        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&CLSID_MMDEVICE_ENUMERATOR, None, CLSCTX_ALL)
            .map_err(|e| CaptureError(format!("无法创建音频设备枚举：{e}")))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| CaptureError(format!("无法打开默认播放设备：{e}")))?;
        let client: IAudioClient = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| CaptureError(format!("无法激活音频客户端：{e}")))?;

        let mix = client.GetMixFormat().map_err(|e| CaptureError(format!("无法读取混音格式：{e}")))?;
        let mix = &*mix;
        let channels = mix.nChannels;
        let rate = mix.nSamplesPerSec;
        let bits = mix.wBitsPerSample;
        let block = mix.nBlockAlign as usize;

        let flags = AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
        client
            .Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 10_000_000, 0, mix, None)
            .map_err(|e| CaptureError(format!("无法打开系统回环：{e}")))?;

        let event = CreateEventW(None, false, false, None).map_err(|e| CaptureError(e.to_string()))?;
        client.SetEventHandle(event).map_err(|e| CaptureError(e.to_string()))?;
        let capture: IAudioCaptureClient = client.GetService().map_err(|e| CaptureError(e.to_string()))?;

        client.Start().map_err(|e| CaptureError(format!("无法开始录音：{e}")))?;
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
                    let slice = unsafe { std::slice::from_raw_parts(data as *const u8, bytes) };
                    append_as_pcm16(&mut pcm, slice, bits, channels);
                }
                let _ = unsafe { capture.ReleaseBuffer(frames) };
            }
        }
        let _ = unsafe { client.Stop() };
        let _ = unsafe { CloseHandle(event) };

        let (duration, _peak, silent) = assess_pcm16(rate, channels, &pcm);
        let frames = pcm.len() / (channels as usize * 2).max(1);
        require_usable(duration, frames)?;
        write_pcm16_wav(path, rate, channels, &pcm)?;
        Ok((duration, silent))
    }

    fn append_as_pcm16(out: &mut Vec<u8>, raw: &[u8], bits: u16, channels: u16) {
        match bits {
            16 => out.extend_from_slice(raw),
            32 => {
                // float32 mix format is common
                for chunk in raw.chunks_exact(4) {
                    let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                    let clamped = sample.clamp(-1.0, 1.0);
                    let i = (clamped * 32767.0).round() as i16;
                    out.extend_from_slice(&i.to_le_bytes());
                }
                let _ = channels;
            }
            _ => {
                // treat as silence of matching frame count
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
}
