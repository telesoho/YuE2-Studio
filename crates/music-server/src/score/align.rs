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
}

#[derive(Clone, Debug)]
pub struct LyricAlignment {
    pub lyrics: String,
    pub display_abc: String,
    #[allow(dead_code)]
    pub notes: Vec<AlignedNote>,
    #[allow(dead_code)]
    pub unassigned: Vec<Unassigned>,
    pub warnings: Vec<String>,
    #[allow(dead_code)]
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
    tag: String,
    index: usize,
    music: String,
}

struct SectionSpan {
    tag: String,
    start: f64,
    end: f64,
}

/// Timed syllables from written lyrics on the recogniser's clock.
///
/// The recogniser text is discarded; only its times are used. Empty when no
/// sung line was heard clearly enough to place - the caller keeps the written
/// lyrics and reports no-match rather than spreading them evenly over the song.
pub fn syllables_from_provided(heard: &[(f64, String)], lyrics: &str) -> Vec<TimedWord> {
    if heard.is_empty() {
        return Vec::new();
    }
    let line_hits = crate::lyrics_sync::heard_line_starts(heard, lyrics);
    if line_hits.iter().all(|(_, at)| at.is_none()) {
        return Vec::new();
    }
    let lined = crate::lyrics_sync::align_lyrics(heard, lyrics);
    if lined.is_empty() {
        return Vec::new();
    }

    let heard_pieces = expand_heard_pieces(heard);
    let mut timed: Vec<TimedWord> = Vec::new();
    for (index, (start, text)) in lined.iter().enumerate() {
        let end = lined
            .get(index + 1)
            .map(|(next, _)| *next)
            .unwrap_or_else(|| heard.last().map(|(at, _)| *at + 2.0).unwrap_or(start + 4.0));
        let written: Vec<String> = text
            .split_whitespace()
            .flat_map(split_word)
            .filter(|piece| !piece.is_empty())
            .collect();
        if written.is_empty() {
            continue;
        }
        let inside: Vec<&(f64, String)> = heard_pieces
            .iter()
            .filter(|(at, _)| *at >= *start - 0.01 && *at < end)
            .collect();
        let mut placed: Vec<Option<f64>> = vec![None; written.len()];
        let mut cursor = 0usize;
        for (position, syllable) in written.iter().enumerate() {
            let expected = normalise_piece(syllable);
            if expected.is_empty() {
                continue;
            }
            if let Some(found) = inside[cursor..].iter().position(|(_, heard_word)| {
                heard_word == &expected
                    || (expected.chars().count() > 3 && heard_word.starts_with(&stem_piece(&expected)))
            }) {
                placed[position] = Some(inside[cursor + found].0);
                cursor += found + 1;
            }
        }
        fill_gaps(&written, &mut placed, *start, end);
        for (syllable, at) in written.iter().zip(placed.iter()) {
            let start_at = at.unwrap_or(*start);
            timed.push(TimedWord {
                text: syllable.clone(),
                start: start_at,
                end: start_at + 0.05,
            });
        }
    }
    // Give each syllable an end at the next start so note placement has a span.
    for index in 0..timed.len() {
        let end = timed
            .get(index + 1)
            .map(|next| next.start)
            .unwrap_or(timed[index].start + 0.4);
        timed[index].end = end.max(timed[index].start + 0.05);
    }
    timed
}

/// Align written lyrics onto the Vocal melody using recogniser times only.
pub fn align_provided_lyrics(abc: &str, heard: &[(f64, String)], lyrics: &str) -> LyricAlignment {
    let syllables = syllables_from_provided(heard, lyrics);
    let mut aligned = align_lyrics(abc, &syllables, true);
    // Keep the written words: lyrics_text rebuilds from note slots and would
    // replace the user's line breaks with whatever landed on the staff.
    if crate::auto_title::has_sung_lines(lyrics) {
        aligned.lyrics = sectioned_lyrics_kept(lyrics);
        if syllables.is_empty() {
            aligned.warnings.push(crate::score::reading::warn_code("scoreWarnLyricsNoMatch"));
        }
    }
    aligned
}

/// Put written lyrics on Vocal notes in order. No recogniser: its text is not
/// a lyric sheet, and realign must not replace the page with a new transcript.
///
/// ponytail: one syllable per note. Melisma (one word held across notes) is
/// not inferred; add it when a score needs held syllables marked `-`.
pub fn align_written_lyrics(abc: &str, lyrics: &str) -> LyricAlignment {
    let syllables = written_syllables(lyrics);
    let times = vocal_note_spans(abc);
    let words: Vec<TimedWord> = syllables
        .iter()
        .zip(times.iter())
        .map(|(text, (start, end))| TimedWord {
            text: text.clone(),
            start: *start,
            end: end.max(start + 0.05),
        })
        .collect();
    let mut aligned = align_lyrics(abc, &words, true);
    if crate::auto_title::has_sung_lines(lyrics) {
        aligned.lyrics = sectioned_lyrics_kept(lyrics);
    }
    let dropped = syllables.len().saturating_sub(times.len());
    if dropped > 0 && !times.is_empty() {
        aligned.warnings.push(crate::score::reading::warn_fields(
            "scoreWarnUnassigned",
            &[("count", dropped.to_string())],
        ));
    }
    aligned
}

fn written_syllables(lyrics: &str) -> Vec<String> {
    lyrics
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !(line.starts_with('[') && line.ends_with(']')))
        .flat_map(split_word)
        .filter(|piece| !piece.is_empty())
        .collect()
}

fn vocal_note_spans(abc: &str) -> Vec<(f64, f64)> {
    let Ok(score) = abc::parse(abc) else {
        return Vec::new();
    };
    sounding_notes(&score, score.bpm)
        .into_iter()
        .map(|note| (note.start, note.end))
        .collect()
}

fn sectioned_lyrics_kept(lyrics: &str) -> String {
    lyrics.replace("\r\n", "\n").replace('\r', "\n").trim().to_string()
}

fn expand_heard_pieces(heard: &[(f64, String)]) -> Vec<(f64, String)> {
    let mut pieces = Vec::new();
    for (index, (start, text)) in heard.iter().enumerate() {
        let end = heard
            .get(index + 1)
            .map(|(next, _)| *next)
            .unwrap_or_else(|| start + (0.4_f64).max(text.chars().count() as f64 * 0.25));
        let parts = split_word(text);
        if parts.is_empty() {
            continue;
        }
        let span = (end - start).max(0.05) / parts.len() as f64;
        for (offset, part) in parts.into_iter().enumerate() {
            let normalised = normalise_piece(&part);
            if normalised.is_empty() {
                continue;
            }
            pieces.push((start + offset as f64 * span, normalised));
        }
    }
    pieces
}

fn fill_gaps(written: &[String], placed: &mut [Option<f64>], start: f64, end: f64) {
    let mut previous_time = start;
    let mut position = 0usize;
    while position < written.len() {
        if let Some(at) = placed[position] {
            previous_time = at;
            position += 1;
            continue;
        }
        let gap_start = position;
        while position < written.len() && placed[position].is_none() {
            position += 1;
        }
        let next_time = placed.get(position).copied().flatten().unwrap_or(end);
        let span = (next_time - previous_time).max(0.05);
        let weight: usize = written[gap_start..position].iter().map(|word| word.chars().count().max(1)).sum();
        let mut used = 0usize;
        for offset in gap_start..position {
            let length = written[offset].chars().count().max(1);
            let share = (used as f64 + length as f64 / 2.0) / weight as f64;
            placed[offset] = Some(previous_time + span * share);
            used += length;
        }
        previous_time = next_time;
    }
}

fn normalise_piece(word: &str) -> String {
    word.chars().filter(|character| character.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

fn stem_piece(word: &str) -> String {
    let count = word.chars().count();
    word.chars().take(count.saturating_sub(1)).collect()
}

/// Align recogniser words onto the Vocal melody of a native ABC score.
///
/// When `fit` is true, a global scale/offset is searched so recogniser times
/// land on note onsets. Off leaves times as heard (identity transform).
pub fn align_lyrics(abc: &str, words: &[TimedWord], fit: bool) -> LyricAlignment {
    let Ok(score) = abc::parse(abc) else {
        let syllables = syllables_from_words(words);
        let lyrics = join_syllables(syllables.iter().map(|s| s.text.as_str()));
        return LyricAlignment {
            lyrics,
            display_abc: abc.to_string(),
            notes: Vec::new(),
            unassigned: syllables
                .into_iter()
                .map(|s| Unassigned { text: s.text, start: s.start })
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
    let (scale, offset) = if fit { fit_lyric_timing(&notes, &timing) } else { (1.0, 0.0) };
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
        if texts.is_empty() {
            continue;
        }
        // Syllables that end before the next free note (plus a small window)
        // would otherwise be dropped when they sit slightly early of the melody.
        // Place them one-per-note from that note instead of parking them as
        // unassigned (which appends them at the end of the lyric block).
        if candidates.is_empty() {
            let early = notes.get(cursor).is_some_and(|note| end <= note.start + ONSET_WINDOW);
            if early {
                let mut index = cursor;
                for text in &texts {
                    while index < notes.len() && !slots[index].is_empty() {
                        index += 1;
                    }
                    if index >= notes.len() {
                        unassigned.push(Unassigned { text: text.clone(), start: group.start });
                    } else {
                        slots[index] = text.clone();
                        index += 1;
                    }
                }
                cursor = index;
            } else {
                for text in &texts {
                    unassigned.push(Unassigned { text: text.clone(), start: group.start });
                }
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
        let aligned = align_lyrics(ABC, &words, true);
        assert!(aligned.bpm == Some(120));
        assert!(aligned.display_abc.contains("w:"));
        assert!(!strip_w_lines(&aligned.display_abc).contains("w:"));
        assert!(abc::parse(&strip_w_lines(&aligned.display_abc)).is_ok());
        assert!(!aligned.lyrics.is_empty());
        assert!(aligned.notes.iter().any(|n| !n.syllable.is_empty() && n.syllable != "-"));
    }

    #[test]
    fn early_leading_syllables_land_on_the_first_notes() {
        // "春眠" ends before the first note; without early placement they were
        // unassigned and the staff opened on 不 instead of 春.
        let words = vec![
            TimedWord { text: "春".into(), start: -0.3, end: -0.15 },
            TimedWord { text: "眠".into(), start: -0.15, end: -0.01 },
            TimedWord { text: "不".into(), start: 0.0, end: 0.5 },
            TimedWord { text: "觉".into(), start: 0.5, end: 1.0 },
            TimedWord { text: "晓".into(), start: 1.0, end: 1.5 },
            TimedWord { text: "处".into(), start: 1.5, end: 2.0 },
            TimedWord { text: "处".into(), start: 2.0, end: 2.5 },
            TimedWord { text: "闻".into(), start: 2.5, end: 3.0 },
        ];
        let aligned = align_lyrics(ABC, &words, false);
        let staff = aligned.display_abc.lines().find(|line| line.trim_start().starts_with("w:")).expect("w line");
        assert!(staff.contains("春") && staff.contains("眠"), "{staff}");
        let tokens: Vec<&str> = staff.trim_start_matches("w:").split_whitespace().filter(|t| *t != "*" && *t != "-").collect();
        assert_eq!(tokens.first().copied(), Some("春"), "{staff}");
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
        let aligned = align_lyrics(ABC, &words, true);
        assert!(!aligned.warnings.is_empty() || !aligned.unassigned.is_empty());
    }

    #[test]
    fn provided_chinese_lyrics_follow_written_text_not_asr() {
        // Recogniser mangles the line and invents 天; the written lyrics still land on the notes.
        // Ten written syllables need ten vocal notes.
        let score = "X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=120\nV: Vocal clef=treble name=\"Vocal Melody\" snm=\"Vocal\"\nV: Ins clef=treble name=\"Ins Melody\" snm=\"Inst.\"\nK:C\n% verse\nV: Vocal\n\"C\"C2D2E2F2G2A2B2c2|d2e2z12|\nV: Ins\nZ2|\n";
        let heard = vec![
            (0.0, "春".into()),
            (0.4, "眠".into()),
            (0.8, "不".into()),
            (1.2, "觉".into()),
            (1.6, "晓".into()),
            (2.0, "处".into()),
            (2.4, "处".into()),
            (2.8, "闻".into()),
            (3.2, "天".into()),
        ];
        let lyrics = "[Verse]\n春眠不觉晓\n处处闻啼鸟";
        let syllables = syllables_from_provided(&heard, lyrics);
        assert!(!syllables.is_empty());
        let joined: String = syllables.iter().map(|s| s.text.as_str()).collect();
        assert!(joined.contains("春眠不觉晓"));
        assert!(joined.contains("啼鸟"), "written characters the recogniser never said still appear: {joined}");
        assert!(!joined.contains('天'), "ASR-only character must not become a syllable: {joined}");
        let aligned = align_provided_lyrics(score, &heard, lyrics);
        assert_eq!(aligned.lyrics, lyrics);
        assert!(aligned.display_abc.contains("啼"), "written 啼 must reach the staff: {}", aligned.display_abc);
        assert!(!aligned.display_abc.contains('天'), "ASR-only 天 must not reach the staff: {}", aligned.display_abc);
    }

    #[test]
    fn provided_repeated_chorus_consumes_occurrences_in_order() {
        let heard = vec![
            (0.0, "la".into()),
            (0.3, "la".into()),
            (0.6, "hey".into()),
            (2.0, "la".into()),
            (2.3, "la".into()),
            (2.6, "hey".into()),
        ];
        let lyrics = "[Chorus]\nla la hey\n\n[Verse]\nmiddle bit\n\n[Chorus]\nla la hey";
        let syllables = syllables_from_provided(&heard, lyrics);
        assert!(syllables.len() >= 6);
        let chorus_starts: Vec<f64> = syllables
            .iter()
            .filter(|s| s.text == "la" || s.text == "hey")
            .map(|s| s.start)
            .collect();
        assert!(chorus_starts.len() >= 6);
        // First chorus cluster before the second.
        assert!(chorus_starts[0] < 1.5);
        assert!(chorus_starts[chorus_starts.len() - 1] >= 2.0);
    }

    #[test]
    fn written_lyrics_stay_on_the_page_and_on_the_notes() {
        let lyrics = "[Verse]\n春眠不觉晓\n处处闻啼鸟";
        let aligned = align_written_lyrics(ABC, lyrics);
        assert_eq!(aligned.lyrics, lyrics);
        let staff = aligned.display_abc.lines().find(|line| line.trim_start().starts_with("w:")).expect("w line");
        assert!(staff.contains("春") && staff.contains("眠") && staff.contains("晓"), "{staff}");
        assert!(!staff.contains('天'), "nothing the page did not say: {staff}");
    }

    #[test]
    fn provided_lyrics_with_no_match_stay_empty_for_caller() {
        let heard = vec![(0.0, "zzzz".into()), (0.5, "yyyy".into())];
        let lyrics = "[Verse]\n春眠不觉晓";
        assert!(syllables_from_provided(&heard, lyrics).is_empty());
        let aligned = align_provided_lyrics(ABC, &heard, lyrics);
        assert!(aligned.warnings.iter().any(|w| w.contains("scoreWarnLyricsNoMatch")));
        assert!(aligned.lyrics.contains("春眠不觉晓"));
    }
}
