//! Score reading (识谱): SheetSage2 melody+chords, then vocals, lyrics, and
//! alignment into a library track the jianpu editor can open.

use std::collections::HashMap;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use super::align::{self, TimedWord};

/// Stages reported to the UI while a reading runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Transcribe,
    Vocals,
    Lyrics,
    Align,
    Done,
}

fn ser_progress<S: serde::Serializer>(bits: &Arc<AtomicU64>, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_f64(f64::from_bits(bits.load(Ordering::Relaxed)))
}

#[derive(Debug, Clone, Serialize)]
pub struct Reading {
    pub id: String,
    pub status: String,
    pub stage: Stage,
    /// Overall fraction 0..1; shared so blocking stages can update without the RwLock.
    #[serde(serialize_with = "ser_progress")]
    pub progress: Arc<AtomicU64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub song_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub abc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_abc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip)]
    pub cancel: Arc<AtomicBool>,
}

impl Reading {
    pub fn running(id: String) -> Self {
        Self {
            id,
            status: "running".into(),
            stage: Stage::Transcribe,
            progress: Arc::new(AtomicU64::new(0f64.to_bits())),
            song_id: None,
            abc: None,
            display_abc: None,
            lyrics: None,
            warnings: Vec::new(),
            error: None,
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_progress(&self, value: f64) {
        self.progress.store(value.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
    }

    pub fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }
}

pub type Readings = Arc<tokio::sync::RwLock<HashMap<String, Reading>>>;

pub fn new_store() -> Readings {
    Arc::new(tokio::sync::RwLock::new(HashMap::new()))
}

/// Whisper / Parakeet give onset + text; invent a short end from the next onset.
pub fn words_with_ends(words: &[(f64, String)]) -> Vec<TimedWord> {
    words
        .iter()
        .enumerate()
        .map(|(index, (start, text))| {
            let end = words
                .get(index + 1)
                .map(|(next, _)| *next)
                .unwrap_or_else(|| start + (0.4_f64).max(text.chars().count() as f64 * 0.25));
            TimedWord {
                text: text.clone(),
                start: *start,
                end: end.max(start + 0.05),
            }
        })
        .collect()
}

/// File extension from the name or the first bytes.
pub fn audio_extension(name: &str, bytes: &[u8]) -> &'static str {
    let from_name = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    match from_name.as_deref() {
        Some("mp3") => "mp3",
        Some("wav") => "wav",
        Some("flac") => "flac",
        Some("ogg") => "ogg",
        Some("m4a") | Some("aac") => "m4a",
        _ => sniff_audio(bytes),
    }
}

fn sniff_audio(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WAVE" {
        "wav"
    } else if bytes.starts_with(b"fLaC") {
        "flac"
    } else if bytes.starts_with(b"OggS") {
        "ogg"
    } else if bytes.starts_with(b"ID3") || (bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] & 0xE0 == 0xE0) {
        "mp3"
    } else {
        "wav"
    }
}

/// Title for a score reading: stem of the file, or a fixed label.
pub fn reading_title(name: &str) -> String {
    Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Score reading".into())
}

#[derive(Debug, Deserialize)]
pub struct SaveScoreRequest {
    pub abc: String,
}

/// Metadata settings a score reading stores on the library track.
pub fn score_settings(abc: &str, display_abc: &str, language: &str, warnings: &[String]) -> serde_json::Value {
    serde_json::json!({
        "abc": abc,
        "display_abc": display_abc,
        "language": language,
        "warnings": warnings,
    })
}

/// Stable warning payload the UI translates (`{"code":…}` plus optional fields).
pub fn warn_code(code: &str) -> String {
    serde_json::json!({ "code": code }).to_string()
}

pub fn warn_fields(code: &str, fields: &[(&str, String)]) -> String {
    let mut map = serde_json::Map::new();
    map.insert("code".into(), serde_json::Value::String(code.into()));
    for (key, value) in fields {
        map.insert((*key).into(), serde_json::Value::String(value.clone()));
    }
    serde_json::Value::Object(map).to_string()
}

/// Labels for the offline share page (en default; zh / ja / ko / ru when asked).
pub struct ShareLabels {
    pub title: &'static str,
    pub print: &'static str,
    pub missing: &'static str,
}

pub fn share_labels(lang: &str) -> ShareLabels {
    match lang {
        "zh" => ShareLabels { title: "简谱", print: "打印简谱", missing: "简谱模块没有载入。" },
        "ja" => ShareLabels { title: "簡譜", print: "簡譜を印刷", missing: "簡譜モジュールが読み込まれていません。" },
        "ko" => ShareLabels { title: "간보", print: "간보 인쇄", missing: "간보 모듈을 불러오지 못했습니다." },
        "ru" => ShareLabels { title: "Цифровка", print: "Печать цифровки", missing: "Модуль цифровки не загрузился." },
        _ => ShareLabels { title: "Jianpu", print: "Print jianpu", missing: "Jianpu module failed to load." },
    }
}

/// Build an offline share zip: index.html (jianpu), score.abc, lyrics, vendor.
pub fn share_zip(abc: &str, lyrics: &str, vendor: &[(String, Vec<u8>)], lang: &str) -> anyhow::Result<Vec<u8>> {
    let mut buffer = Cursor::new(Vec::new());
    {
        let mut zip = ZipWriter::new(&mut buffer);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("index.html", options)?;
        zip.write_all(standalone_jianpu_html(abc, lang).as_bytes())?;
        zip.start_file("score.abc", options)?;
        let mut score = abc.trim_end().to_owned();
        score.push('\n');
        zip.write_all(score.as_bytes())?;
        if !lyrics.trim().is_empty() {
            zip.start_file("lyrics.txt", options)?;
            zip.write_all(lyrics.as_bytes())?;
            if !lyrics.ends_with('\n') {
                zip.write_all(b"\n")?;
            }
        }
        zip.start_file("README.txt", options)?;
        zip.write_all(
            "Open index.html to view and print the numbered score.\n\
             Upload the share folder (or this zip, unzipped) to Pages / OSS / a public drive,\n\
             then send the public link.\n"
                .as_bytes(),
        )?;
        for (name, bytes) in vendor {
            zip.start_file(format!("vendor/{name}"), options)?;
            zip.write_all(bytes)?;
        }
        zip.finish()?;
    }
    Ok(buffer.into_inner())
}

/// Vendor scripts shipped under `app/public/score/abc2svg/`.
pub fn vendor_dir() -> Option<PathBuf> {
    // Beside the exe (desktop), or from the crate during `cargo run`.
    let candidates = [
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|parent| parent.join("score").join("abc2svg"))),
        Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../app/public/score/abc2svg")),
    ];
    candidates.into_iter().flatten().find(|path| path.join("abc2svg-1.js").is_file())
}

pub fn load_vendor() -> anyhow::Result<Vec<(String, Vec<u8>)>> {
    let dir = vendor_dir().ok_or_else(|| anyhow::anyhow!("jianpu vendor missing: app/public/score/abc2svg"))?;
    let mut files = Vec::new();
    for name in ["abc2svg-1.js", "jianpu-1.js", "diag-1.js"] {
        let path = dir.join(name);
        let bytes = std::fs::read(&path).map_err(|error| anyhow::anyhow!("read {}: {error}", path.display()))?;
        files.push((name.to_string(), bytes));
    }
    Ok(files)
}

fn standalone_jianpu_html(abc: &str, lang: &str) -> String {
    let labels = share_labels(lang);
    let escaped = abc
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${");
    format!(
        r#"<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>{title}</title>
<style>
html,body{{margin:0;background:#f7f4ef;color:#1b1712;font:14px/1.4 system-ui,sans-serif}}
#toolbar{{display:flex;gap:8px;padding:10px 14px;background:#1a2030;color:#e7eaf3}}
#toolbar button{{background:#ff7a45;color:#1a0e07;border:0;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:600}}
#paper{{padding:12px 16px}}
@media print{{#toolbar{{display:none}}}}
</style>
</head><body>
<div id="toolbar"><button type="button" onclick="window.print()">{print}</button></div>
<div id="paper"></div>
<script src="vendor/abc2svg-1.js"></script>
<script src="vendor/jianpu-1.js"></script>
<script>
const abc = `{escaped}`;
function withJianpu(src) {{
  let text = String(src || "");
  if (!/%%jianpu\b/.test(text)) text = "%%jianpu true\n" + text;
  return text.replace(/^(V:.*)$/gm, function(line) {{
    return line + "\n%%jianpu true";
  }});
}}
(function () {{
  const paper = document.getElementById("paper");
  if (typeof abc2svg === "undefined" || !abc2svg.Abc || !abc2svg.jianpu) {{
    paper.textContent = "{missing}";
    return;
  }}
  const user = {{
    img_out: function (str) {{ paper.insertAdjacentHTML("beforeend", str); }},
    errmsg: function (msg) {{ console.warn(msg); }},
    get_abcmodel: function () {{}}
  }};
  try {{
    const renderer = new abc2svg.Abc(user);
    renderer.tosvg("jianpu", withJianpu(abc));
  }} catch (error) {{
    paper.textContent = String(error);
  }}
}})();
</script>
</body></html>"#,
        title = labels.title,
        print = labels.print,
        missing = labels.missing.replace('\\', "\\\\").replace('"', "\\\""),
        escaped = escaped,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_get_ends_from_neighbours() {
        let words = words_with_ends(&[(0.0, "春".into()), (0.5, "眠".into())]);
        assert_eq!(words[0].end, 0.5);
        assert!(words[1].end > words[1].start);
    }

    #[test]
    fn progress_serialises_as_a_fraction() {
        let reading = Reading::running("job".into());
        reading.set_progress(0.42);
        let value = serde_json::to_value(&reading).expect("json");
        assert_eq!(value["progress"].as_f64().expect("number"), 0.42);
    }

    #[test]
    fn share_zip_holds_score_and_vendor() {
        let vendor = vec![
            ("abc2svg-1.js".into(), b"core".to_vec()),
            ("jianpu-1.js".into(), b"jianpu".to_vec()),
            ("diag-1.js".into(), b"diag".to_vec()),
        ];
        let bytes = share_zip("X:1\nK:C\n", "[Verse]\n春\n", &vendor, "en").expect("zip");
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("open");
        for name in ["index.html", "score.abc", "lyrics.txt", "vendor/abc2svg-1.js", "vendor/jianpu-1.js", "vendor/diag-1.js", "README.txt"] {
            assert!(archive.by_name(name).is_ok(), "missing {name}");
        }
    }

    #[test]
    fn commit_round_trip_uses_align() {
        let display = "X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=120\nV: Vocal clef=treble name=\"Vocal Melody\" snm=\"Vocal\"\nV: Ins clef=treble name=\"Ins Melody\" snm=\"Inst.\"\nK:C\n% verse\nV: Vocal\nC4D4E4F4|G4A4B4c4|\nw: 春 眠 不 觉 晓 处 处 闻\nV: Ins\nZ2|\n";
        let (clean, _, lyrics) = align::commit_edited_abc(display).expect("commit");
        assert!(!clean.contains("w:"));
        assert!(lyrics.contains("春"));
    }
}
