//! Align timestamped lyric syllables to native Vocal notes.
//!
//! The saved score stays free of `w:` lines. A display copy may add them for
//! the staff / jianpu view only. Ported from YuE-studio's `align.py`.

use std::sync::OnceLock;

use regex::Regex;

use super::abc::{self, Score, VOCAL};

const ONSET_WINDOW: f64 = 0.2;
const MIN_OVERLAP: f64 = 0.35;

const PUNCT: &str = ".,!?;:，。！？；：、…—-\"'()[]";

/// One timed word from the speech recogniser.
#[derive(Clone, Debug)]
pub struct TimedWord {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Clone, Debug)]
pub struct AlignedNote {
    pub start: f64,
    pub end: f64,
    pub syllable: String,
    pub section: String,
}

#[derive(Clone, Debug)]
pub struct Unassigned {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Clone, Debug)]
pub struct LyricAlignment {
    pub lyrics: String,
    pub display_abc: String,
    pub notes: Vec<AlignedNote>,
    pub unassigned: Vec<Unassigned>,
    pub warnings: Vec<String>,
    pub bpm: Option<u32>,
}

#[derive(Clone)]
struct LyricGroup {
    start: f64,
    end: f64,
    texts: Vec<String>,
    order: usize,
}

struct VocalGroup {
    section: String,
    tag: String,
    index: usize,
    music: String,
}

struct SectionSpan {
    tag: String,
    start: f64,
    end: f64,
}

/// Align recogniser words onto the Vocal melody of a native ABC score.
pub fn align_lyrics(abc: &str, words: &[TimedWord]) -> LyricAlignment {
    let Ok(score) = abc::parse(abc) else {
        let syllables = syllables_from_words(words);
        let lyrics = join_syllables(syllables.iter().map(|s| s.text.as_str()));
        return LyricAlignment {
            lyrics,
            display_abc: abc.to_string(),
            notes: Vec::new(),
            unassigned: syllables
                .into_iter()
                .map(|s| Unassigned { text: s.text, start: s.start, end: s.end })
                .collect(),
            warnings: vec![crate::score::reading::warn_code("scoreWarnParseFail")],
            bpm: None,
        };
    };
    let bpm = score.bpm;
    let mut notes = sounding_notes(&score, bpm);
    let groups = vocal_groups(abc);
    let spans = section_spans(&groups, &score.voices[VOCAL].bars, bpm);
    tag_notes(&mut notes, &spans);
    let timing = lyric_groups(words);
    let (scale, offset) = fit_lyric_timing(&notes, &timing);
    let (slots, unassigned) = place_lyric_groups(&notes, &timing, scale, offset);
    for (note, slot) in notes.iter_mut().zip(slots.iter()) {
        note.syllable = slot.clone();
    }
    let mut warnings = Vec::new();
    if (scale - 1.0).abs() > f64::EPSILON || offset.abs() > f64::EPSILON {
        warnings.push(crate::score::reading::warn_fields(
            "scoreWarnAlignScale",
            &[("scale", format!("{scale:.2}")), ("offset", format!("{offset:+.2}"))],
        ));
    }
    if !unassigned.is_empty() {
        warnings.push(crate::score::reading::warn_fields(
            "scoreWarnUnassigned",
            &[("count", unassigned.len().to_string())],
        ));
    }
    let positioned = positions_for_groups(&groups);
    let (display, line_slots) = if let Some(ref positioned) = positioned {
        let total: usize = positioned.iter().map(|(_, count, _)| *count).sum();
        if total == notes.len() {
            display_abc(abc, &groups, positioned, &slots)
        } else {
            if !groups.is_empty() && !notes.is_empty() {
                warnings.push(crate::score::reading::warn_code("scoreWarnNoLineSplit"));
            }
            (abc.to_string(), None)
        }
    } else {
        if !groups.is_empty() && !notes.is_empty() {
            warnings.push(crate::score::reading::warn_code("scoreWarnNoLineSplit"));
        }
        (abc.to_string(), None)
    };
    let lyrics = lyrics_text(&groups, &spans, &slots, line_slots.as_deref(), &unassigned, &notes);
    LyricAlignment { lyrics, display_abc: display, notes, unassigned, warnings, bpm: Some(bpm) }
}

/// Strip `w:` lyric lines from a display ABC so the native parser accepts it.
pub fn strip_w_lines(abc: &str) -> String {
    let ends_nl = abc.ends_with('\n');
    let mut kept: Vec<&str> = abc
        .lines()
        .filter(|line| !line.trim_start().to_ascii_lowercase().starts_with("w:"))
        .collect();
    while kept.last().is_some_and(|line| line.trim().is_empty()) {
        kept.pop();
    }
    let mut body = kept.join("\n");
    if !body.is_empty() && ends_nl {
        body.push('\n');
    }
    body
}

/// Build sectioned lyrics from the `w:` lines of a display ABC.
pub fn lyrics_from_display(abc: &str) -> String {
    let lines: Vec<&str> = abc.lines().collect();
    let mut blocks: Vec<(String, Vec<String>)> = Vec::new();
    let mut section = "section".to_string();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        if let Some(rest) = line.strip_prefix("% ") {
            section = rest.trim().to_string();
            if section.is_empty() {
                section = "section".into();
            }
            index += 1;
            continue;
        }
        if line != "V: Vocal" {
            index += 1;
            continue;
        }
        index += 1;
        while index < lines.len() && (lines[index].starts_with("M:") || lines[index].starts_with("K:")) {
            index += 1;
        }
        if index < lines.len() {
            index += 1;
        }
        let mut syllables = Vec::new();
        if index < lines.len() && lines[index].trim_start().to_ascii_lowercase().starts_with("w:") {
            syllables = w_syllables(lines[index]);
            index += 1;
        }
        let text = join_syllables(syllables.iter().map(String::as_str));
        if !text.is_empty() {
            push_line(&mut blocks, &section_tag(&section), text);
        }
    }
    format_blocks(&blocks)
}

/// Validate an edited display ABC: strip `w:`, parse clean, return lyrics.
pub fn commit_edited_abc(text: &str) -> Result<(String, String, String), String> {
    let display = text.to_string();
    let clean = strip_w_lines(&display);
    if clean.trim().is_empty() {
        return Err("请先识谱".into());
    }
    abc::parse(&clean)?;
    let lyrics = lyrics_from_display(&display);
    Ok((clean, display, lyrics))
}

pub fn section_tag(name: &str) -> String {
    let key = name.trim().to_ascii_lowercase();
    match key.as_str() {
        "verse" => "Verse".into(),
        "chorus" => "Chorus".into(),
        "bridge" => "Bridge".into(),
        "intro" => "Intro".into(),
        "outro" => "Outro".into(),
        "interlude" => "Interlude".into(),
        "pre-chorus" | "prechorus" => "Pre-Chorus".into(),
        "" | "section" => "Section".into(),
        _ => {
            let mut chars = name.trim().chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => "Section".into(),
            }
        }
    }
}

pub fn join_syllables<'a>(parts: impl IntoIterator<Item = &'a str>) -> String {
    let mut text = String::new();
    for part in parts {
        if part.is_empty() || part == "-" {
            continue;
        }
        if text.is_empty() {
            text.push_str(part);
            continue;
        }
        let last = text.chars().last().unwrap();
        let first = part.chars().next().unwrap();
        if is_cjk(last) && is_cjk(first) {
            text.push_str(part);
        } else {
            text.push(' ');
            text.push_str(part);
        }
    }
    text
}

fn syllables_from_words(words: &[TimedWord]) -> Vec<TimedWord> {
    let mut syllables = Vec::new();
    for word in words {
        let text = word.text.trim();
        if text.is_empty() || word.end <= word.start {
            continue;
        }
        let pieces = split_word(text);
        if pieces.is_empty() {
            continue;
        }
        let span = (word.end - word.start) / pieces.len() as f64;
        for (index, piece) in pieces.into_iter().enumerate() {
            syllables.push(TimedWord {
                text: piece,
                start: word.start + index as f64 * span,
                end: word.start + (index as f64 + 1.0) * span,
            });
        }
    }
    syllables
}

fn lyric_groups(words: &[TimedWord]) -> Vec<LyricGroup> {
    let mut groups = Vec::new();
    for (order, word) in words.iter().enumerate() {
        let text = word.text.trim();
        if text.is_empty() || word.end <= word.start {
            continue;
        }
        let pieces = split_word(text);
        if pieces.is_empty() {
            continue;
        }
        groups.push(LyricGroup { start: word.start, end: word.end, texts: pieces, order });
    }
    groups.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal).then(a.end.partial_cmp(&b.end).unwrap_or(std::cmp::Ordering::Equal)).then(a.order.cmp(&b.order)));
    groups
}

fn fit_lyric_timing(notes: &[AlignedNote], groups: &[LyricGroup]) -> (f64, f64) {
    let mut onsets: Vec<f64> = notes.iter().map(|n| n.start).collect();
    onsets.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    if onsets.is_empty() || groups.is_empty() {
        return (1.0, 0.0);
    }
    let mut best_score = -1.0_f64;
    let mut near: Vec<(f64, f64, f64, f64)> = Vec::new();
    for scale_i in 90..=110 {
        let scale = scale_i as f64 / 100.0;
        for offset_i in -20..=20 {
            let offset = offset_i as f64 / 20.0;
            let score = onset_score(&onsets, groups, scale, offset);
            if score > best_score + 1e-9 {
                best_score = score;
                near = vec![(offset.abs(), (scale - 1.0).abs(), scale, offset)];
            } else if score >= best_score - 1e-9 {
                near.push((offset.abs(), (scale - 1.0).abs(), scale, offset));
            }
        }
    }
    let (_, _, scale, offset) = near.into_iter().min_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal).then(a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))).unwrap_or((0.0, 0.0, 1.0, 0.0));
    (scale, offset)
}

fn place_lyric_groups(notes: &[AlignedNote], groups: &[LyricGroup], scale: f64, offset: f64) -> (Vec<String>, Vec<Unassigned>) {
    let mut slots = vec![String::new(); notes.len()];
    let mut unassigned = Vec::new();
    let mut cursor = 0usize;
    let mut ordered = groups.to_vec();
    ordered.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal).then(a.end.partial_cmp(&b.end).unwrap_or(std::cmp::Ordering::Equal)).then(a.order.cmp(&b.order)));
    for group in ordered {
        let start = scale * group.start + offset;
        let end = scale * group.end + offset;
        let texts = group.texts.clone();
        let candidates = overlap_candidates(notes, cursor, start, end);
        if candidates.is_empty() || texts.is_empty() {
            for text in &texts {
                unassigned.push(Unassigned { text: text.clone(), start: group.start, end: group.end });
            }
            continue;
        }
        let count = texts.len().min(candidates.len());
        let mut ranked = candidates.clone();
        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal)).then(a.0.cmp(&b.0)));
        let mut picked: Vec<usize> = ranked[..count].iter().map(|item| item.0).collect();
        picked.sort_unstable();
        for (text, index) in texts.iter().zip(picked.iter()) {
            slots[*index] = text.clone();
        }
        if texts.len() > picked.len() {
            let last = *picked.last().unwrap();
            let rest: Vec<&str> = std::iter::once(slots[last].as_str()).chain(texts[picked.len()..].iter().map(String::as_str)).collect();
            slots[last] = join_syllables(rest);
        }
        let chosen: std::collections::HashSet<usize> = picked.iter().copied().collect();
        let first = picked[0];
        let last = *picked.last().unwrap();
        let mut consumed = last;
        for &(index, _, _) in &candidates {
            if chosen.contains(&index) {
                continue;
            }
            if (first < index && index < last) || index > last {
                if slots[index].is_empty() {
                    slots[index] = "-".into();
                }
                if index > consumed {
                    consumed = index;
                }
            }
        }
        cursor = consumed + 1;
    }
    (slots, unassigned)
}

fn onset_score(onsets: &[f64], groups: &[LyricGroup], scale: f64, offset: f64) -> f64 {
    let mut total = 0.0;
    for group in groups {
        let moment = scale * group.start + offset;
        let index = onsets.partition_point(|&onset| onset < moment);
        let mut distance = ONSET_WINDOW;
        if index < onsets.len() {
            distance = distance.min(onsets[index] - moment);
        }
        if index > 0 {
            distance = distance.min(moment - onsets[index - 1]);
        }
        if distance < ONSET_WINDOW {
            total += 1.0 - distance / ONSET_WINDOW;
        }
    }
    total
}

fn overlap_candidates(notes: &[AlignedNote], cursor: usize, start: f64, end: f64) -> Vec<(usize, f64, f64)> {
    let mut found = Vec::new();
    for (index, note) in notes.iter().enumerate().skip(cursor) {
        let duration = note.end - note.start;
        if duration <= 0.0 {
            continue;
        }
        let overlap = note.end.min(end) - note.start.max(start);
        if overlap < MIN_OVERLAP * duration {
            continue;
        }
        found.push((index, overlap, duration));
    }
    found
}

fn sounding_notes(score: &Score, bpm: u32) -> Vec<AlignedNote> {
    score.voices[VOCAL]
        .notes
        .iter()
        .map(|note| {
            let start = note.start.to_f64() * 60.0 / bpm as f64;
            let end = (note.start + note.duration).to_f64() * 60.0 / bpm as f64;
            AlignedNote { start, end, syllable: String::new(), section: "Section".into() }
        })
        .collect()
}

fn vocal_groups(abc: &str) -> Vec<VocalGroup> {
    let lines: Vec<&str> = abc.lines().collect();
    let mut groups = Vec::new();
    let mut section = "section".to_string();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        if let Some(rest) = line.strip_prefix("% ") {
            section = rest.trim().to_string();
            if section.is_empty() {
                section = "section".into();
            }
            index += 1;
            continue;
        }
        if line == "V: Vocal" {
            let mut cursor = index + 1;
            while cursor < lines.len() && (lines[cursor].starts_with("M:") || lines[cursor].starts_with("K:")) {
                cursor += 1;
            }
            if cursor < lines.len() {
                groups.push(VocalGroup {
                    section: section.clone(),
                    tag: section_tag(&section),
                    index: cursor,
                    music: lines[cursor].to_string(),
                });
            }
            index = cursor;
        }
        index += 1;
    }
    groups
}

fn section_spans(groups: &[VocalGroup], bars: &[abc::Bar], bpm: u32) -> Vec<SectionSpan> {
    let mut spans = Vec::new();
    let mut cursor = 0usize;
    for group in groups {
        let Some(count) = bar_count(&group.music) else {
            return Vec::new();
        };
        if cursor + count > bars.len() {
            return Vec::new();
        }
        let chunk = &bars[cursor..cursor + count];
        cursor += count;
        if chunk.is_empty() {
            continue;
        }
        let start = chunk[0].start;
        let end = chunk.last().unwrap().start + chunk.last().unwrap().length;
        spans.push(SectionSpan {
            tag: group.tag.clone(),
            start: start.to_f64() * 60.0 / bpm as f64,
            end: end.to_f64() * 60.0 / bpm as f64,
        });
    }
    if cursor != bars.len() {
        return Vec::new();
    }
    spans
}

fn tag_notes(notes: &mut [AlignedNote], spans: &[SectionSpan]) {
    if spans.is_empty() {
        return;
    }
    for note in notes {
        let mut chosen = spans.last().unwrap().tag.clone();
        for span in spans {
            if span.start <= note.start && note.start < span.end {
                chosen = span.tag.clone();
                break;
            }
        }
        note.section = chosen;
    }
}

fn bar_count(line: &str) -> Option<usize> {
    if !line.ends_with('|') {
        return None;
    }
    let mut count = 0usize;
    for bar in line[..line.len() - 1].split('|') {
        let bar = bar.trim();
        if bar.is_empty() {
            return None;
        }
        count += abc::whole_rest_bars(bar).unwrap_or(1);
    }
    Some(count)
}

fn token_re() -> &'static Regex {
    static TOKEN: OnceLock<Regex> = OnceLock::new();
    TOKEN.get_or_init(|| {
        Regex::new(r#"^(?:"(?P<chord>[^"\n]*)"|\[K:(?P<key>[^\]\n]+)\]|(?P<acc>\^\^|__|\^|_|=)?(?P<note>[A-Ga-gz])(?P<oct>[,']*)(?P<duration>[0-9]*)(?P<tie>-?))"#).expect("token")
    })
}

fn lyric_positions(line: &str, mut pending_tie: bool) -> Option<(Vec<&'static str>, bool)> {
    if !line.ends_with('|') {
        return None;
    }
    let token = token_re();
    let mut positions = Vec::new();
    for bar in line[..line.len() - 1].split('|') {
        let bar = bar.trim();
        if bar.is_empty() {
            return None;
        }
        if abc::whole_rest_bars(bar).is_some() {
            if pending_tie {
                return None;
            }
            continue;
        }
        let mut cursor = 0;
        while cursor < bar.len() {
            let ch = bar[cursor..].chars().next()?;
            if ch.is_whitespace() {
                cursor += ch.len_utf8();
                continue;
            }
            let rest = &bar[cursor..];
            let caps = token.captures(rest)?;
            cursor += caps.get(0)?.end();
            if caps.name("chord").is_some() || caps.name("key").is_some() {
                continue;
            }
            if caps.name("note").map(|m| m.as_str()) == Some("z") {
                if pending_tie {
                    return None;
                }
                continue;
            }
            positions.push(if pending_tie { "tie" } else { "note" });
            pending_tie = caps.name("tie").is_some_and(|m| !m.as_str().is_empty());
        }
    }
    Some((positions, pending_tie))
}

fn positions_for_groups(groups: &[VocalGroup]) -> Option<Vec<(usize, usize, Vec<&'static str>)>> {
    let mut pending = false;
    let mut positioned = Vec::new();
    for group in groups {
        let (positions, next) = lyric_positions(&group.music, pending)?;
        pending = next;
        let note_count = positions.iter().filter(|&&kind| kind == "note").count();
        positioned.push((group.index, note_count, positions));
    }
    if pending {
        return None;
    }
    Some(positioned)
}

fn display_abc(abc: &str, groups: &[VocalGroup], positioned: &[(usize, usize, Vec<&'static str>)], slots: &[String]) -> (String, Option<Vec<Vec<String>>>) {
    let mut by_index = std::collections::BTreeMap::new();
    let mut line_slots = Vec::new();
    let mut cursor = 0usize;
    for (group, (index, count, positions)) in groups.iter().zip(positioned.iter()) {
        let chunk: Vec<String> = slots[cursor..cursor + count].to_vec();
        cursor += count;
        line_slots.push(chunk.clone());
        if let Some(lyric) = render_w(positions, &chunk) {
            if *index == group.index {
                by_index.insert(*index, lyric);
            }
        }
    }
    let ends_nl = abc.ends_with('\n');
    let mut rendered = Vec::new();
    for (index, line) in abc.lines().enumerate() {
        rendered.push(line.to_string());
        if let Some(lyric) = by_index.get(&index) {
            rendered.push(lyric.clone());
        }
    }
    let mut text = rendered.join("\n");
    if ends_nl {
        text.push('\n');
    }
    (text, Some(line_slots))
}

fn render_w(positions: &[&str], slots: &[String]) -> Option<String> {
    let mut tokens = Vec::new();
    let mut index = 0usize;
    for &kind in positions {
        if kind == "note" {
            tokens.push(w_token(slots.get(index).map(String::as_str).unwrap_or("")));
            index += 1;
        } else {
            let previous = tokens.last().map(String::as_str).unwrap_or("*");
            tokens.push(if previous != "*" && previous != "-" { "-" } else { "*" }.into());
        }
    }
    if !tokens.iter().any(|token| token != "*" && token != "-") {
        return None;
    }
    Some(format!("w: {}", tokens.join(" ")))
}

fn w_token(text: &str) -> String {
    if text.is_empty() || text == "*" {
        return "*".into();
    }
    if text == "-" {
        return "-".into();
    }
    let cleaned = text.replace('|', "").replace(' ', "~");
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        "*".into()
    } else {
        cleaned.into()
    }
}

fn lyrics_text(
    groups: &[VocalGroup],
    spans: &[SectionSpan],
    _slots: &[String],
    line_slots: Option<&[Vec<String>]>,
    unassigned: &[Unassigned],
    notes: &[AlignedNote],
) -> String {
    let mut blocks: Vec<(String, Vec<String>)> = Vec::new();
    if let Some(line_slots) = line_slots {
        for (group, chunk) in groups.iter().zip(line_slots.iter()) {
            let text = join_syllables(chunk.iter().map(String::as_str));
            if !text.is_empty() {
                push_line(&mut blocks, &group.tag, text);
            }
        }
    } else {
        let mut current_tag: Option<String> = None;
        let mut bucket: Vec<String> = Vec::new();
        let flush = |tag: &Option<String>, bucket: &mut Vec<String>, blocks: &mut Vec<(String, Vec<String>)>| {
            if let (Some(tag), true) = (tag, !bucket.is_empty()) {
                let text = join_syllables(bucket.iter().map(String::as_str));
                push_line(blocks, tag, text);
            }
            bucket.clear();
        };
        for note in notes {
            let tag = if note.section.is_empty() { "Section" } else { &note.section };
            if current_tag.is_none() {
                current_tag = Some(tag.to_string());
            }
            if current_tag.as_deref() != Some(tag) {
                flush(&current_tag, &mut bucket, &mut blocks);
                current_tag = Some(tag.to_string());
            }
            if !note.syllable.is_empty() && note.syllable != "-" {
                bucket.push(note.syllable.clone());
            }
        }
        flush(&current_tag, &mut bucket, &mut blocks);
    }
    for item in unassigned {
        let tag = span_tag(spans, item.start).unwrap_or_else(|| blocks.last().map(|(t, _)| t.clone()).unwrap_or_else(|| "Section".into()));
        push_line(&mut blocks, &tag, item.text.clone());
    }
    format_blocks(&blocks)
}

fn span_tag(spans: &[SectionSpan], start: f64) -> Option<String> {
    for span in spans {
        if span.start <= start && start < span.end {
            return Some(span.tag.clone());
        }
    }
    if let Some(last) = spans.last() {
        if start >= last.end {
            return Some(last.tag.clone());
        }
    }
    spans.first().map(|s| s.tag.clone())
}

fn push_line(blocks: &mut Vec<(String, Vec<String>)>, tag: &str, line: String) {
    if let Some((last_tag, lines)) = blocks.last_mut() {
        if last_tag == tag {
            lines.push(line);
            return;
        }
    }
    blocks.push((tag.to_string(), vec![line]));
}

fn format_blocks(blocks: &[(String, Vec<String>)]) -> String {
    blocks
        .iter()
        .filter_map(|(tag, lines)| {
            let body: Vec<&str> = lines.iter().map(String::as_str).filter(|line| !line.is_empty()).collect();
            if body.is_empty() {
                None
            } else {
                Some(format!("[{tag}]\n{}", body.join("\n")))
            }
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn w_syllables(w_line: &str) -> Vec<String> {
    let body = w_line.split_once(':').map(|(_, rest)| rest).unwrap_or("");
    body.split_whitespace()
        .filter(|token| *token != "*" && *token != "-")
        .map(|token| token.replace('~', " "))
        .collect()
}

fn split_word(text: &str) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut latin = String::new();
    for ch in text.chars() {
        if ch.is_whitespace() || PUNCT.contains(ch) {
            if !latin.is_empty() {
                pieces.push(std::mem::take(&mut latin));
            }
            continue;
        }
        if is_cjk(ch) {
            if !latin.is_empty() {
                pieces.push(std::mem::take(&mut latin));
            }
            pieces.push(ch.to_string());
        } else {
            latin.push(ch);
        }
    }
    if !latin.is_empty() {
        pieces.push(latin);
    }
    pieces
}

fn is_cjk(ch: char) -> bool {
    matches!(ch as u32,
        0x3400..=0x9FFF | 0xF900..=0xFAFF | 0x3040..=0x30FF | 0xAC00..=0xD7AF
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const ABC: &str = "X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=120\nV: Vocal clef=treble name=\"Vocal Melody\" snm=\"Vocal\"\nV: Ins clef=treble name=\"Ins Melody\" snm=\"Inst.\"\nK:C\n% verse\nV: Vocal\n\"C\"C4D4E4F4|G4A4B4c4|\nV: Ins\nZ2|\n";

    #[test]
    fn syllables_land_on_vocal_notes_and_display_gets_w() {
        let words = vec![TimedWord {
            text: "春眠不觉晓处处闻".into(),
            start: 0.0,
            end: 4.0,
        }];
        let aligned = align_lyrics(ABC, &words);
        assert!(aligned.bpm == Some(120));
        assert!(aligned.display_abc.contains("w:"));
        assert!(!strip_w_lines(&aligned.display_abc).contains("w:"));
        assert!(abc::parse(&strip_w_lines(&aligned.display_abc)).is_ok());
        assert!(!aligned.lyrics.is_empty());
        assert!(aligned.notes.iter().any(|n| !n.syllable.is_empty() && n.syllable != "-"));
    }

    #[test]
    fn commit_strips_w_and_keeps_lyrics() {
        let display = "X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=120\nV: Vocal clef=treble name=\"Vocal Melody\" snm=\"Vocal\"\nV: Ins clef=treble name=\"Ins Melody\" snm=\"Inst.\"\nK:C\n% verse\nV: Vocal\nC4D4E4F4|G4A4B4c4|\nw: 春 眠 不 觉 晓 处 处 闻\nV: Ins\nZ2|\n";
        let (clean, _, lyrics) = commit_edited_abc(display).expect("commit");
        assert!(!clean.contains("w:"));
        assert!(lyrics.contains("春"));
        assert!(abc::parse(&clean).is_ok());
    }

    #[test]
    fn unassigned_words_warn() {
        let words = vec![TimedWord {
            text: "远".into(),
            start: 100.0,
            end: 101.0,
        }];
        let aligned = align_lyrics(ABC, &words);
        assert!(!aligned.warnings.is_empty() || !aligned.unassigned.is_empty());
    }
}
