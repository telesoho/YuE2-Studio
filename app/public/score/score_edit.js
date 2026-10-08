/**
 * Jianpu editor for Yue Studio.
 * The page shows the vocal staff (唱) and the accompaniment staff (伴).
 * Both staves edit in the browser. w: lyrics stay on the vocal staff.
 * Lyrics are edited on 词 lines in the text score. Selecting those words
 * marks the matching syllables on the jianpu.
 * The text score sits to the left of the staff. Editing it redraws the jianpu.
 * Clicking a jianpu note marks that span in the text score and scrolls it into view.
 * Drag the divider to resize the text score and the staff.
 * A rest of a half note or longer is drawn as several 0s; the clicked 0 is one edit.
 * Durations are integer L: counts in the YuE set (1 2 3 4 6 8 12 16 24 32 48).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.yueScoreEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DURATIONS = new Set([1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48]);
  const PLAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6l8.2-4.8z"/></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h2.6v10H4zm5.4 0H12v10H9.4z"/></svg>';
  const STOP_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4h8v8H4z"/></svg>';
  const STEPS = "CDEFGAB";
  const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACC = { "^^": 2, "^": 1, "=": 0, _: -1, __: -2 };
  const ABS_TEXT = { 2: "^^", 1: "^", 0: "=", "-1": "_", "-2": "__" };
  const FIFTHS = {
    Cb: -7, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1, C: 0,
    G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
    Abm: -7, Ebm: -6, Bbm: -5, Fm: -4, Cm: -3, Gm: -2, Dm: -1, Am: 0,
    Em: 1, Bm: 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6, "A#m": 7,
  };
  const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
  const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
  const SIGNATURE_MAJOR = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  const TOKEN = /^(?:"([^"\n]*)"|\[K:([^\]\n]+)\]|(\^\^|__|\^|_|=)?([A-Ga-gz])([,']*)([0-9]*)(-?))/;

  function keyAlter(stepIdx, fifths) {
    if (fifths > 0) return SHARP_ORDER.slice(0, fifths).indexOf(stepIdx) >= 0 ? 1 : 0;
    if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).indexOf(stepIdx) >= 0 ? -1 : 0;
    return 0;
  }

  function keyFromName(text) {
    const raw = String(text || "").trim().split(/\s+/)[0] || "C";
    const match = /^([A-G])([#b])?(m)?/.exec(raw);
    if (!match) return keyFromName("C");
    const name = match[1] + (match[2] || "") + (match[3] || "");
    return {
      step: match[1],
      acc: match[2] || "",
      fifths: Object.prototype.hasOwnProperty.call(FIFTHS, name) ? FIFTHS[name] : 0,
      name: name,
    };
  }

  function cloneKey(key) {
    return { step: key.step, acc: key.acc, fifths: key.fifths, name: key.name };
  }

  // Jianpu numbers from the major key of the signature. Minor prints the tonic as 6.
  function degreeTonic(key) {
    const major = SIGNATURE_MAJOR[key.fifths + 7] || "C";
    return STEPS.indexOf(major[0]);
  }

  function jianpuKeyLabel(key) {
    if (String(key.name).endsWith("m")) return "6=" + key.name.slice(0, -1);
    return "1=" + key.name;
  }

  function keyFromJianpuLabel(degree, pitch) {
    const minor = String(degree) === "6";
    if (!minor && String(degree) !== "1") return null;
    const name = minor ? pitch + "m" : pitch;
    const key = keyFromName(name);
    if (!knownKey(key.name) || key.name !== name) return null;
    return key;
  }

  function parseHeader(lines) {
    let meter = [4, 4];
    let lDen = 8;
    let bpm = 120;
    let key = keyFromName("C");
    for (let i = 0; i < lines.length && i < 12; i++) {
      const line = lines[i];
      const meterMatch = /^M:\s*(\d+)\s*\/\s*(\d+)/.exec(line);
      if (meterMatch) meter = [Number(meterMatch[1]), Number(meterMatch[2])];
      const unit = /^L:1\/(\d+)/.exec(line);
      if (unit) lDen = Number(unit[1]);
      const tempo = /^Q:1\/4=(\d+)/.exec(line);
      if (tempo) bpm = Number(tempo[1]);
      const keyLine = /^K:\s*(.*)$/.exec(line);
      if (keyLine) key = keyFromName(keyLine[1]);
    }
    return { meter: meter, lDen: lDen, bpm: bpm, key: key };
  }

  function perBarUnits(meter, lDen) {
    if (!meter[1]) return 0;
    return meter[0] * lDen / meter[1];
  }

  // abc2svg keeps one lyric cursor per voice. A vocal line with no w: would
  // pin the next lyric to the first note of the voice. The text score pins
  // w: to the line above it, so a silent vocal line gets one "*" per note.
  function padVocalLyrics(abc) {
    const lines = String(abc || "").split(/\r?\n/);
    const header = parseHeader(lines);
    let key = header.key;
    let perBar = perBarUnits(header.meter, header.lDen);
    let voice = "";
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^M:\s*\d/.test(line)) {
        const meterMatch = /^M:\s*(\d+)\s*\/\s*(\d+)/.exec(line);
        if (meterMatch) perBar = perBarUnits([Number(meterMatch[1]), Number(meterMatch[2])], header.lDen);
        out.push(line);
        continue;
      }
      if (/^K:\s*/.test(line)) {
        key = keyFromName(line.slice(2));
        out.push(line);
        continue;
      }
      if (line === "V: Vocal" || line === "V: Ins") {
        voice = line === "V: Vocal" ? "Vocal" : "Ins";
        out.push(line);
        continue;
      }
      const trimmed = line.trim();
      const music = voice === "Vocal" && trimmed && !/^[%w]/.test(trimmed);
      if (!music) {
        out.push(line);
        continue;
      }
      out.push(line);
      const scanned = scanMusic(line, key, perBar);
      if (scanned.error) continue;
      key = scanned.key;
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      if (j < lines.length && /^w:/.test(lines[j])) continue;
      const notes = scanned.events.filter((ev) => ev.kind === "note").length;
      if (notes) out.push("w: " + new Array(notes).fill("*").join(" "));
    }
    return out.join("\n");
  }

  function jianpuAbcWithDirective(src) {
    const padded = padVocalLyrics(src);
    const withVoices = padded.replace(/^(V:.*)$/gm, "$1\n%%jianpu true");
    if (withVoices !== padded) return withVoices;
    const lines = padded.split(/\r?\n/);
    let kIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^K:\s*/.test(lines[i])) {
        kIdx = i;
        break;
      }
    }
    const injection = "%%jianpu true\n";
    if (kIdx < 0) return injection + padded;
    return lines.slice(0, kIdx + 1).join("\n") + "\n" + injection + lines.slice(kIdx + 1).join("\n");
  }

  const DIAGRAM_OFF = "off";

  function normalizeDiagram(kind) {
    if (kind === "guitar" || kind === "ukulele") return kind;
    return DIAGRAM_OFF;
  }

  function diagramDirective(kind) {
    if (kind === "guitar") return "%%diagram 6\n";
    if (kind === "ukulele") return "%%diagram 4\n";
    return "";
  }

  function previewAbc(abc, diagram) {
    const src = jianpuAbcWithDirective(String(abc || ""));
    const kind = normalizeDiagram(diagram);
    if (kind === DIAGRAM_OFF) return src;
    if (typeof abc2svg !== "undefined" && !abc2svg.diag) return src;
    const inject = diagramDirective(kind);
    return inject ? inject + src : src;
  }

  function countHeads(svg) {
    const text = String(svg || "");
    const vocal = text.match(/<text class="fj v-Vocal"[^>]*>[0-7]<\/text>/g);
    if (vocal && vocal.length) return vocal.length;
    const matches = text.match(/<text class="fj(?: [^"]*)?"[^>]*>[0-7]<\/text>/g);
    return matches ? matches.length : 0;
  }

  function noteMidi(abc, index, voice) {
    const score = timeline(abc);
    if (!score.notes) return null;
    const want = voice || "Vocal";
    for (const note of score.notes) {
      if ((note.voice || "Vocal") !== want) continue;
      if (note.indexes.indexOf(index) >= 0) return note.midi;
    }
    return null;
  }

  function scientific(letter, marks) {
    let octave = /[a-g]/.test(letter) ? 5 : 4;
    for (const mark of marks || "") octave += mark === "'" ? 1 : -1;
    return octave;
  }

  function spellLetter(step, sci) {
    if (sci >= 5 && sci <= 8) {
      return { letter: step.toLowerCase(), marks: "'".repeat(sci - 5) };
    }
    if (sci >= 1 && sci <= 4) {
      return { letter: step, marks: ",".repeat(4 - sci) };
    }
    return null;
  }

  function spell(degree, jpOctave, key, relative) {
    const tonic = degreeTonic(key);
    const degree0 = degree - 1;
    const stepIdx = (tonic + degree0) % 7;
    const wrap = Math.floor((tonic + degree0) / 7);
    const shift = tonic === 6 ? 1 : 0;
    const sci = 4 + jpOctave + wrap - shift;
    const abs = keyAlter(stepIdx, key.fifths) + relative;
    if (abs < -2 || abs > 2) return null;
    const written = spellLetter(STEPS[stepIdx], sci);
    if (!written) return null;
    const acc = relative === 0 ? "" : ABS_TEXT[String(abs)];
    if (acc == null) return null;
    return { acc: acc, letter: written.letter, marks: written.marks, stepIdx: stepIdx };
  }

  function midiNumber(letter, marks, acc, key, local) {
    const step = letter.toUpperCase();
    let written = 60 + NATURAL[step] + (/[a-g]/.test(letter) ? 12 : 0);
    for (const mark of marks || "") written += mark === "'" ? 12 : -12;
    let alter = keyAlter(STEPS.indexOf(step), key.fifths);
    if (acc) alter = ACC[acc];
    else if (local && local[step] != null) alter = local[step];
    return written + alter;
  }

  function readJp(ev) {
    if (ev.kind !== "note") return null;
    const stepIdx = STEPS.indexOf(ev.letter.toUpperCase());
    const tonic = degreeTonic(ev.key);
    const sci = scientific(ev.letter, ev.marks);
    const degree0 = (stepIdx - tonic + 7) % 7;
    const wrap = Math.floor((tonic + degree0) / 7);
    const shift = tonic === 6 ? 1 : 0;
    const keyAlt = keyAlter(stepIdx, ev.key.fifths);
    const relative = ev.acc ? ACC[ev.acc] - keyAlt : 0;
    return { degree: degree0 + 1, octave: sci - 4 - wrap + shift, relative: relative, stepIdx: stepIdx };
  }

  function printToken(ev) {
    if (ev.kind === "zrest") return ev.bars > 1 ? "Z" + ev.bars : "Z";
    const dur = ev.units === 1 ? "" : String(ev.units);
    if (ev.kind === "rest") return "z" + dur;
    return (ev.acc || "") + ev.letter + (ev.marks || "") + dur + (ev.tie ? "-" : "");
  }

  function lyricToken(ev) {
    if (ev.kind !== "note") return "*";
    const text = String(ev.lyric == null ? "*" : ev.lyric).replace(/[|\s]/g, "");
    if (!text || text === "*") return "*";
    if (text === "-") return "-";
    return text;
  }

  // abc2svg draws a syllable as text. "*" is empty, and "-" / "_" are extender lines.
  function lyricIsDrawn(text) {
    const token = String(text == null ? "" : text).trim();
    return token !== "" && token !== "*" && token !== "-" && token !== "_";
  }

  function isCjkChar(ch) {
    const code = ch.codePointAt(0);
    return (code >= 0x3400 && code <= 0x9fff)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0x3040 && code <= 0x30ff)
      || (code >= 0xac00 && code <= 0xd7af);
  }

  // One token per vocal note, with offsets into `text`.
  // Spaced text keeps spaces; unspaced CJK is one character per token.
  function lyricBodySpans(text) {
    const raw = String(text == null ? "" : text);
    if (!raw) return [];
    if (/\s/.test(raw)) {
      const spans = [];
      const re = /\S+/g;
      let match;
      while ((match = re.exec(raw))) {
        let token = match[0];
        if (token === "·" || token === "*") token = "*";
        else if (token === "-") token = "-";
        else token = token.replace(/[|\s]/g, "") || "*";
        spans.push({ token: token, start: match.index, end: match.index + match[0].length });
      }
      return spans;
    }
    const spans = [];
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === "·" || ch === "*") {
        spans.push({ token: "*", start: i, end: i + 1 });
        i += 1;
        continue;
      }
      if (ch === "-") {
        spans.push({ token: "-", start: i, end: i + 1 });
        i += 1;
        continue;
      }
      if (isCjkChar(ch)) {
        spans.push({ token: ch, start: i, end: i + 1 });
        i += 1;
        continue;
      }
      let j = i + 1;
      while (
        j < raw.length
        && !isCjkChar(raw[j])
        && raw[j] !== "·"
        && raw[j] !== "*"
        && raw[j] !== "-"
      ) {
        j += 1;
      }
      const word = raw.slice(i, j).replace(/[|\s]/g, "");
      if (word) spans.push({ token: word, start: i, end: j });
      i = j;
    }
    return spans;
  }

  function splitLyricLine(text) {
    return lyricBodySpans(String(text == null ? "" : text).trim()).map((span) => span.token);
  }

  // Spans of a 词 line, offsets into the raw line (leading spaces included).
  function lyricLineSpans(line) {
    const raw = String(line == null ? "" : line);
    const lead = raw.length - raw.trimStart().length;
    const trim = raw.trim();
    const prefix = /^词\s*/.exec(trim);
    if (!prefix) return [];
    const origin = lead + prefix[0].length;
    return lyricBodySpans(trim.slice(prefix[0].length)).map((span) => ({
      token: span.token,
      start: origin + span.start,
      end: origin + span.end,
    }));
  }

  function displayLyricToken(lyric) {
    const text = String(lyric == null ? "*" : lyric).trim();
    if (!text || text === "*") return "·";
    if (text === "-") return "-";
    return text;
  }

  function clusterRows(items, slack) {
    const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const item of sorted) {
      const row = rows[rows.length - 1];
      if (!row || Math.abs(item.y - row.y) > slack) rows.push({ y: item.y, items: [item] });
      else row.items.push(item);
    }
    for (const row of rows) row.items.sort((a, b) => a.x - b.x);
    return rows;
  }

  // Pair lyric glyphs with the vocal notes above them. Rests and melismas draw no syllable.
  // When counts disagree, bind the shorter side left-to-right.
  function assignLyricHits(heads, glyphs, drawn, limits) {
    const slack = limits && limits.rowSlack != null ? limits.rowSlack : 8;
    const maxGap = limits && limits.maxGap != null ? limits.maxGap : 80;
    const vocalRows = clusterRows((heads || []).filter((head) => (head.voice || "Vocal") === "Vocal"), slack);
    const glyphRows = clusterRows(glyphs || [], slack);
    const hits = [];
    for (const row of glyphRows) {
      let staff = null;
      for (const candidate of vocalRows) {
        if (candidate.y >= row.y - 2) continue;
        if (!staff || candidate.y > staff.y) staff = candidate;
      }
      if (!staff || row.y - staff.y > maxGap) continue;
      let below = null;
      for (const candidate of vocalRows) {
        if (candidate.y <= row.y + 2) continue;
        if (!below || candidate.y < below.y) below = candidate;
      }
      if (below && below.y - row.y < row.y - staff.y) continue;
      const seen = new Set();
      const indexes = [];
      for (const head of staff.items) {
        if (seen.has(head.index)) continue;
        seen.add(head.index);
        indexes.push(head.index);
      }
      const slots = indexes.filter((index) => drawn && drawn[index]);
      const count = Math.min(slots.length, row.items.length);
      if (!count) continue;
      for (let i = 0; i < count; i++) hits.push({ glyph: row.items[i], index: slots[i] });
    }
    return hits;
  }

  // A syllable painted under a note is already the lyric. Binding can drop a
  // tight row; this still claims the glyph so the editor does not add a mark.
  function glyphsUnderNotes(heads, glyphs, limits) {
    const maxGap = limits && limits.maxGap != null ? limits.maxGap : 80;
    const xSlack = limits && limits.xSlack != null ? limits.xSlack : 28;
    const vocal = (heads || []).filter((head) => (head.voice || "Vocal") === "Vocal");
    const used = new Set();
    const hits = [];
    const sorted = (glyphs || []).slice().sort((a, b) => a.y - b.y || a.x - b.x);
    for (const glyph of sorted) {
      let best = null;
      let bestDy = Infinity;
      let bestDx = Infinity;
      for (const head of vocal) {
        if (used.has(head.index)) continue;
        const dy = glyph.y - head.y;
        if (dy <= 2 || dy > maxGap) continue;
        const dx = Math.abs(glyph.x - head.x);
        if (dx > xSlack) continue;
        if (dy < bestDy - 0.5 || (Math.abs(dy - bestDy) <= 0.5 && dx < bestDx)) {
          best = head;
          bestDy = dy;
          bestDx = dx;
        }
      }
      if (!best) continue;
      used.add(best.index);
      hits.push({ glyph: glyph, index: best.index });
    }
    return hits;
  }

  // Invisible click targets only. A drawn syllable, a melisma line, or a glyph
  // already under the digit must not grow a middle dot that looks like a low octave.
  function emptyLyricSlots(events, covered) {
    const slots = [];
    const seen = new Set();
    const has = (index) => {
      if (!covered) return false;
      if (typeof covered.has === "function") return covered.has(index);
      return !!covered[index];
    };
    for (const ev of events || []) {
      if (!ev || ev.kind !== "note" || seen.has(ev.index)) continue;
      seen.add(ev.index);
      if (has(ev.index) || lyricIsDrawn(ev.lyric)) continue;
      const token = String(ev.lyric == null ? "*" : ev.lyric).trim();
      if (token === "-" || token === "_") continue;
      slots.push(ev.index);
    }
    return slots;
  }

  function assignLyrics(events, wLine) {
    const tokens = wLine
      ? wLine.replace(/^w:\s*/, "").trim().split(/\s+/).filter(Boolean)
      : [];
    const noteCount = events.filter((ev) => ev.kind === "note").length;
    if (tokens.length === events.length) {
      events.forEach((ev, index) => {
        ev.lyric = tokens[index];
      });
      return;
    }
    let cursor = 0;
    for (const ev of events) {
      if (ev.kind === "note" && tokens.length === noteCount) ev.lyric = tokens[cursor++] || "*";
      else if (ev.kind === "note") ev.lyric = cursor < tokens.length ? tokens[cursor++] : "*";
      else ev.lyric = "*";
    }
  }

  function scanMusic(line, key, perBar) {
    const events = [];
    let barIndex = 0;
    let barUnits = 0;
    let pendingTie = false;
    let pendingChord = "";
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === "|") {
        barIndex += 1;
        barUnits = 0;
        i += 1;
        continue;
      }
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      const zrest = /^Z([2-4])?/.exec(line.slice(i));
      if (zrest) {
        const bars = zrest[1] ? Number(zrest[1]) : 1;
        const units = bars * perBar;
        events.push({
          kind: "zrest",
          units: units,
          bars: bars,
          start: i,
          end: i + zrest[0].length,
          raw: zrest[0],
          barIndex: barIndex,
          perBar: perBar,
          key: cloneKey(key),
          lyric: "*",
          tie: false,
          continuesTie: false,
          acc: "",
          letter: "z",
          marks: "",
          chord: pendingChord,
        });
        pendingChord = "";
        barUnits += units;
        pendingTie = false;
        i += zrest[0].length;
        continue;
      }
      const match = TOKEN.exec(line.slice(i));
      if (!match) return { error: "读不懂这里的记号" };
      const raw = match[0];
      if (match[1] != null) {
        pendingChord = match[1];
        i += raw.length;
        continue;
      }
      if (match[2] != null) {
        key = keyFromName(match[2]);
        i += raw.length;
        continue;
      }
      const units = match[6] ? Number(match[6]) : 1;
      const tie = match[7] === "-";
      const rest = match[4] === "z";
      events.push({
        kind: rest ? "rest" : "note",
        units: units,
        bars: 1,
        start: i,
        end: i + raw.length,
        raw: raw,
        barIndex: barIndex,
        perBar: perBar,
        key: cloneKey(key),
        lyric: "*",
        tie: tie,
        continuesTie: pendingTie && !rest,
        acc: match[3] || "",
        letter: match[4],
        marks: match[5] || "",
        chord: pendingChord,
      });
      pendingChord = "";
      barUnits += units;
      pendingTie = tie;
      i += raw.length;
    }
    return { events: events, key: key };
  }

  function collect(abc) {
    const lines = String(abc || "").split(/\r?\n/);
    const header = parseHeader(lines);
    let key = header.key;
    let perBar = perBarUnits(header.meter, header.lDen);
    const buckets = { Vocal: [], Ins: [] };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^M:\s*\d/.test(line)) {
        const meterMatch = /^M:\s*(\d+)\s*\/\s*(\d+)/.exec(line);
        if (meterMatch) perBar = perBarUnits([Number(meterMatch[1]), Number(meterMatch[2])], header.lDen);
        i += 1;
        continue;
      }
      if (/^K:\s*/.test(line)) {
        key = keyFromName(line.slice(2));
        i += 1;
        continue;
      }
      const voice = line === "V: Vocal" ? "Vocal" : line === "V: Ins" ? "Ins" : "";
      if (!voice) {
        i += 1;
        continue;
      }
      i += 1;
      while (i < lines.length && /^(M:|K:)/.test(lines[i])) {
        if (lines[i].startsWith("M:")) {
          const meterMatch = /^M:\s*(\d+)\s*\/\s*(\d+)/.exec(lines[i]);
          if (meterMatch) perBar = perBarUnits([Number(meterMatch[1]), Number(meterMatch[2])], header.lDen);
        } else {
          key = keyFromName(lines[i].slice(2));
        }
        i += 1;
      }
      if (i >= lines.length) break;
      const scanned = scanMusic(lines[i], key, perBar);
      if (scanned.error) {
        return { error: scanned.error, lines: lines, events: [], ins: [], header: header };
      }
      key = scanned.key;
      const musicLine = i;
      i += 1;
      let lyricLine = -1;
      let wLine = null;
      if (voice === "Vocal" && i < lines.length && /^w:/.test(lines[i])) {
        lyricLine = i;
        wLine = lines[i];
        i += 1;
      }
      if (voice === "Vocal") assignLyrics(scanned.events, wLine);
      const bucket = buckets[voice];
      for (const ev of scanned.events) {
        ev.line = musicLine;
        ev.lyricLine = lyricLine;
        ev.voice = voice;
        ev.index = bucket.length;
        bucket.push(ev);
      }
    }
    return { lines: lines, events: buckets.Vocal, ins: buckets.Ins, header: header, error: null };
  }

  function barSum(events, ev) {
    return events
      .filter((item) => !item.removed && item.line === ev.line && item.barIndex === ev.barIndex)
      .reduce((sum, item) => sum + item.units + (item.spawn ? item.spawn.units : 0), 0);
  }

  function acceptBar(oldSum, newSum, perBar) {
    if (newSum > perBar) return "这一小节会超过拍号";
    if (oldSum === perBar && newSum !== perBar) return "这一小节的拍数对不上";
    return null;
  }

  function applySpans(line, reps) {
    const ordered = reps.slice().sort((a, b) => b.start - a.start);
    let out = line;
    for (const rep of ordered) out = out.slice(0, rep.start) + rep.text + out.slice(rep.end);
    return out;
  }

  function rewriteMusic(lines, events) {
    const byLine = new Map();
    for (const ev of events) {
      if (ev.inserted) continue;
      if (!byLine.has(ev.line)) byLine.set(ev.line, []);
      byLine.get(ev.line).push(ev);
    }
    for (const [lineNo, group] of byLine) {
      const reps = [];
      for (const ev of group) {
        if (ev.removed) {
          reps.push({ start: ev.start, end: ev.end, text: "" });
          continue;
        }
        let text = printToken(ev);
        if (ev.insertAfter) text += ev.insertAfter;
        if (text !== ev.raw) reps.push({ start: ev.start, end: ev.end, text: text });
      }
      if (reps.length) lines[lineNo] = applySpans(lines[lineNo], reps);
    }
  }

  function visibleEvents(events) {
    const out = [];
    for (const ev of events) {
      if (ev.removed) continue;
      out.push(ev);
      if (ev.spawn) out.push(ev.spawn);
    }
    return out;
  }

  function rewriteLyrics(lines, events) {
    const groups = new Map();
    for (const ev of visibleEvents(events)) {
      if (!groups.has(ev.line)) groups.set(ev.line, []);
      groups.get(ev.line).push(ev);
    }
    const musicLines = [...groups.keys()].sort((a, b) => b - a);
    for (const musicLine of musicLines) {
      const group = groups.get(musicLine);
      // abc2svg skips rests, so a "*" written for a rest would land on the next note.
      const tokens = group.filter((ev) => ev.kind === "note").map(lyricToken);
      const meaningful = tokens.some((token) => token !== "*" && token !== "-");
      const has = lines[musicLine + 1] && /^w:/.test(lines[musicLine + 1]);
      if (!meaningful) {
        if (has) lines.splice(musicLine + 1, 1);
        continue;
      }
      const text = "w: " + tokens.join(" ");
      if (has) lines[musicLine + 1] = text;
      else lines.splice(musicLine + 1, 0, text);
    }
  }

  function joinAbc(lines, abc) {
    let text = lines.join("\n");
    if (String(abc || "").endsWith("\n") && !text.endsWith("\n")) text += "\n";
    return text;
  }

  function breakTies(events, index) {
    const ev = events[index];
    if (ev.tie) ev.tie = false;
    const prev = events[index - 1];
    if (prev && prev.tie && ev.continuesTie && prev.line === ev.line) {
      prev.tie = false;
      ev.continuesTie = false;
    }
    const next = events[index + 1];
    if (ev.tie && next && next.continuesTie) {
      ev.tie = false;
      next.continuesTie = false;
    }
  }

  function applySpelling(ev, spelled) {
    ev.kind = "note";
    ev.acc = spelled.acc;
    ev.letter = spelled.letter;
    ev.marks = spelled.marks;
    const midi = midiNumber(spelled.letter, spelled.marks, spelled.acc, ev.key, null);
    if (midi < 0 || midi > 127) return "这个音超出音域";
    return null;
  }

  function makeRest(ev) {
    ev.kind = "rest";
    ev.acc = "";
    ev.letter = "z";
    ev.marks = "";
    ev.tie = false;
    ev.continuesTie = false;
    ev.lyric = "*";
    ev.bars = 1;
  }

  function tonicNote(ev, units) {
    const spelled = spell(1, 0, ev.key, 0);
    return {
      kind: "note",
      units: units,
      bars: 1,
      line: ev.line,
      barIndex: ev.barIndex,
      perBar: ev.perBar,
      key: cloneKey(ev.key),
      lyric: "*",
      tie: false,
      continuesTie: false,
      acc: spelled.acc,
      letter: spelled.letter,
      marks: spelled.marks,
      inserted: true,
    };
  }

  function checkUnits(units) {
    return Number.isInteger(units) && DURATIONS.has(units);
  }

  function quarterUnits(lDen) {
    const units = lDen / 4;
    return Number.isInteger(units) && units >= 1 ? units : 0;
  }

  function samePitch(a, b) {
    if (!a || !b || a.kind !== "note" || b.kind !== "note") return false;
    const left = readJp(a);
    const right = readJp(b);
    return left.degree === right.degree && left.octave === right.octave && left.relative === right.relative;
  }

  function sliceUnits(ev, lDen) {
    const count = digitGlyphs(ev, lDen);
    if (count <= 1 || ev.kind === "note") return null;
    if (ev.kind === "zrest") {
      const bar = ev.perBar;
      if (ev.bars !== count || !checkUnits(bar) || ev.units !== count * bar) return null;
      return Array(count).fill(bar);
    }
    const quarter = quarterUnits(lDen);
    if (!quarter || ev.units !== count * quarter) return null;
    return Array(count).fill(quarter);
  }

  function padLyricStars(lines, events, ev, count) {
    if (ev.lyricLine < 0) return;
    const lyricAt = ev.lyricLine;
    if (!lines[lyricAt] || !/^w:/.test(lines[lyricAt])) return;
    const tokens = lines[lyricAt].replace(/^w:\s*/, "").trim().split(/\s+/).filter(Boolean);
    const onLine = events.filter((item) => item.line === ev.line);
    if (tokens.length !== onLine.length) return;
    const pos = onLine.findIndex((item) => item === ev);
    if (pos < 0) return;
    const extra = [];
    for (let n = 1; n < count; n++) extra.push("*");
    tokens.splice(pos + 1, 0, ...extra);
    lines[lyricAt] = "w: " + tokens.join(" ");
  }

  // One ABC rest is drawn as several 0s. Split it so the clicked 0 can change alone.
  function expandSlicedRest(abc, voice, index, slice) {
    const parsed = collect(abc);
    if (parsed.error) return { abc: abc, index: index, error: parsed.error };
    const events = voice === "Ins" ? parsed.ins : parsed.events;
    if (index < 0 || index >= events.length) return { abc: abc, index: index };
    const ev = events[index];
    const count = digitGlyphs(ev, parsed.header.lDen);
    if (count <= 1 || ev.kind === "note") return { abc: abc, index: index };
    const sizes = sliceUnits(ev, parsed.header.lDen);
    if (!sizes) return { abc: abc, index: index, error: "这个休止拆不开" };
    if (slice < 0 || slice >= sizes.length) return { abc: abc, index: index };
    const tokens = sizes.map((units) => "z" + (units === 1 ? "" : String(units))).join("");
    const lines = parsed.lines.slice();
    lines[ev.line] = lines[ev.line].slice(0, ev.start) + tokens + lines[ev.line].slice(ev.end);
    if (voice !== "Ins") padLyricStars(lines, events, ev, sizes.length);
    return { abc: joinAbc(lines, abc), index: index + slice };
  }

  function editScore(abc, command) {
    const voice = command.voice === "Ins" ? "Ins" : "Vocal";
    if (command.slice != null) {
      const expanded = expandSlicedRest(abc, voice, command.index | 0, command.slice | 0);
      if (expanded.error) return { abc: abc, error: expanded.error };
      const result = editScore(expanded.abc, Object.assign({}, command, {
        index: expanded.index,
        voice: voice,
        slice: null,
      }));
      if (result.error) return { abc: abc, error: result.error };
      return result;
    }
    const parsed = collect(abc);
    if (parsed.error) return { abc: abc, error: parsed.error };
    const events = voice === "Ins" ? parsed.ins : parsed.events;
    const index = command.index | 0;
    if (!events.length) {
      return { abc: abc, error: voice === "Ins" ? "没有可编辑的伴奏音符" : "没有可编辑的人声音符" };
    }
    if (index < 0 || index >= events.length) return { abc: abc, error: "没有这个音" };
    const ev = events[index];
    const op = command.op;
    let lyricsDirty = false;
    let leftover = 0;
    let select = index;
    const oldSum = barSum(events, ev);

    if (op === "degree") {
      const degree = command.degree | 0;
      if (ev.kind === "zrest" && (ev.bars !== 1 || !checkUnits(ev.units))) {
        return { abc: abc, error: "整段休止不能改成一个音" };
      }
      const wasRest = ev.kind !== "note";
      breakTies(events, index);
      if (degree === 0) {
        makeRest(ev);
        lyricsDirty = true;
      } else if (degree >= 1 && degree <= 7) {
        const jp = ev.kind === "note" ? readJp(ev) : { octave: 0 };
        const spelled = spell(degree, jp.octave || 0, ev.key, 0);
        if (!spelled) return { abc: abc, error: "这个音超出音域" };
        const range = applySpelling(ev, spelled);
        if (range) return { abc: abc, error: range };
        if (wasRest) {
          ev.lyric = "*";
          lyricsDirty = true;
        }
      } else {
        return { abc: abc, error: "唱名要用 1 到 7，休止是 0" };
      }
    } else if (op === "octave") {
      if (ev.kind !== "note") return { abc: abc, error: "休止没有八度" };
      const jp = readJp(ev);
      const spelled = spell(jp.degree, jp.octave + (command.delta | 0), ev.key, jp.relative);
      if (!spelled) return { abc: abc, error: "这个音超出音域" };
      breakTies(events, index);
      const range = applySpelling(ev, spelled);
      if (range) return { abc: abc, error: range };
    } else if (op === "accidental") {
      if (ev.kind !== "note") return { abc: abc, error: "休止没有升降号" };
      const jp = readJp(ev);
      let relative = jp.relative;
      if (command.kind === "sharp") relative = relative === 1 ? 0 : 1;
      else if (command.kind === "flat") relative = relative === -1 ? 0 : -1;
      else {
        const abs = ev.acc ? ACC[ev.acc] : keyAlter(jp.stepIdx, ev.key.fifths);
        relative = abs === 0 ? 0 : -keyAlter(jp.stepIdx, ev.key.fifths);
        if (abs === 0 && ev.acc) relative = 0;
      }
      const spelled = spell(jp.degree, jp.octave, ev.key, relative);
      if (!spelled) return { abc: abc, error: "这个音超出音域" };
      breakTies(events, index);
      const range = applySpelling(ev, spelled);
      if (range) return { abc: abc, error: range };
    } else if (op === "duration") {
      if (ev.kind === "zrest") return { abc: abc, error: "整段休止先改成音符再改时值" };
      const factor = command.factor;
      breakTies(events, index);
      if (factor === 0.5) {
        const half = ev.units / 2;
        if (!checkUnits(half) || !checkUnits(ev.units - half)) {
          return { abc: abc, error: "这个时值写不进曲谱" };
        }
        const rest = tonicNote(ev, ev.units - half);
        rest.kind = "rest";
        rest.letter = "z";
        rest.acc = "";
        rest.marks = "";
        ev.units = half;
        ev.spawn = rest;
        ev.insertAfter = printToken(rest);
        lyricsDirty = true;
      } else if (factor === 2 || factor === 1.5) {
        const added = factor === 2 ? ev.units : ev.units / 2;
        const nextUnits = factor === 2 ? ev.units * 2 : ev.units + added;
        if (!checkUnits(nextUnits) || !Number.isInteger(added)) {
          return { abc: abc, error: "这个时值写不进曲谱" };
        }
        const next = events[index + 1];
        if (!next || next.removed || next.line !== ev.line || next.barIndex !== ev.barIndex ||
            (next.kind !== "rest" && next.kind !== "zrest") || next.units < added) {
          return { abc: abc, error: "这一小节会超过拍号" };
        }
        if (next.kind === "zrest") return { abc: abc, error: "这一小节会超过拍号" };
        const left = next.units - added;
        if (left !== 0 && !checkUnits(left)) return { abc: abc, error: "这个时值写不进曲谱" };
        ev.units = nextUnits;
        if (left === 0) next.removed = true;
        else next.units = left;
        lyricsDirty = true;
      } else {
        return { abc: abc, error: "这个时值写不进曲谱" };
      }
      const problem = acceptBar(oldSum, barSum(events, ev), ev.perBar);
      if (problem) return { abc: abc, error: problem };
    } else if (op === "insert") {
      if (ev.kind === "zrest" && ev.bars !== 1) return { abc: abc, error: "这里插不进同长度的音" };
      breakTies(events, index);
      if (oldSum + ev.units <= ev.perBar) {
        const problem = acceptBar(oldSum, oldSum + ev.units, ev.perBar);
        if (!problem) {
          const spawned = tonicNote(ev, ev.units);
          ev.spawn = spawned;
          ev.insertAfter = printToken(spawned);
          lyricsDirty = true;
        }
      }
      if (!ev.spawn) {
        const half = ev.units / 2;
        if (!checkUnits(half)) return { abc: abc, error: "这里插不进同长度的音" };
        const spawned = tonicNote(ev, half);
        ev.units = half;
        if (ev.kind === "zrest") makeRest(ev);
        ev.spawn = spawned;
        ev.insertAfter = printToken(spawned);
        lyricsDirty = true;
      }
    } else if (op === "delete") {
      if (ev.kind === "rest" || ev.kind === "zrest") {
        const prev = events[index - 1];
        if (ev.kind === "zrest" || !prev || prev.line !== ev.line || prev.barIndex !== ev.barIndex || prev.kind === "zrest") {
          return { abc: abc, error: "删掉后这一小节不够拍" };
        }
        const merged = prev.units + ev.units;
        if (!checkUnits(merged)) return { abc: abc, error: "删掉后这一小节不够拍" };
        breakTies(events, index);
        prev.units = merged;
        ev.removed = true;
        lyricsDirty = true;
      } else {
        breakTies(events, index);
        makeRest(ev);
        lyricsDirty = true;
      }
      const problem = acceptBar(oldSum, barSum(events, ev.removed ? events[index - 1] || ev : ev), ev.perBar);
      if (problem) return { abc: abc, error: problem };
    } else if (op === "tie") {
      if (ev.kind !== "note") return { abc: abc, error: "休止不能连音" };
      const next = events[index + 1];
      if (!samePitch(ev, next)) return { abc: abc, error: "连音要接在后面同样的音上" };
      ev.tie = !ev.tie;
      next.continuesTie = ev.tie;
    } else if (op === "sustain") {
      if (ev.kind !== "note") return { abc: abc, error: "休止不能延长" };
      const added = quarterUnits(parsed.header.lDen);
      const nextUnits = ev.units + added;
      if (!added || !checkUnits(nextUnits)) return { abc: abc, error: "这个时值写不进曲谱" };
      const next = events[index + 1];
      if (!next || next.removed || next.line !== ev.line || next.barIndex !== ev.barIndex || next.kind !== "rest") {
        return { abc: abc, error: "后面没有可以让出来的休止" };
      }
      if (next.units < added) return { abc: abc, error: "后面的休止不够一拍" };
      const left = next.units - added;
      if (left !== 0 && !checkUnits(left)) return { abc: abc, error: "这个时值写不进曲谱" };
      breakTies(events, index);
      ev.units = nextUnits;
      if (left === 0) next.removed = true;
      else next.units = left;
      lyricsDirty = true;
      const problem = acceptBar(oldSum, barSum(events, ev), ev.perBar);
      if (problem) return { abc: abc, error: problem };
    } else if (op === "lyric") {
      if (voice === "Ins") return { abc: abc, error: "伴奏没有歌词" };
      if (ev.kind !== "note") return { abc: abc, error: "休止的歌词是 *" };
      const text = String(command.text == null ? "" : command.text).trim();
      ev.lyric = text && text !== "*" ? text : "*";
      lyricsDirty = true;
    } else if (op === "lyric-line") {
      if (voice === "Ins") return { abc: abc, error: "伴奏没有歌词" };
      const lineNo = ev.line;
      const notes = events.filter((item) => !item.removed && item.line === lineNo && item.kind === "note");
      if (!notes.length) return { abc: abc, error: "这一行没有可填词的音" };
      const tokens = splitLyricLine(command.text);
      notes.forEach((note, i) => {
        if (i < tokens.length) {
          const token = tokens[i];
          note.lyric = token && token !== "*" ? token : "*";
        } else {
          note.lyric = "*";
        }
      });
      leftover = Math.max(0, tokens.length - notes.length);
      lyricsDirty = true;
    } else {
      return { abc: abc, error: "不支持这个修改" };
    }

    if (op === "insert") select = index + 1;
    if (op === "delete" && ev.removed) select = Math.max(0, index - 1);
    const lines = parsed.lines.slice();
    rewriteMusic(lines, events);
    if (lyricsDirty && voice !== "Ins") rewriteLyrics(lines, events);
    const result = { abc: joinAbc(lines, abc), error: null, index: select };
    if (leftover) result.leftover = leftover;
    return result;
  }

  function accidentalName(acc) {
    if (acc === "^" || acc === "^^") return "sharp";
    if (acc === "_" || acc === "__") return "flat";
    if (acc === "=") return "natural";
    return "";
  }

  function eventsFor(abc, voice) {
    const parsed = collect(abc);
    if (parsed.error) return [];
    const events = voice === "Ins" ? parsed.ins : parsed.events;
    return events.map((ev) => {
      const jp = ev.kind === "note" ? readJp(ev) : null;
      return {
        index: ev.index,
        kind: ev.kind,
        lyric: ev.lyric,
        units: ev.units,
        digit: jp ? String(jp.degree) : "0",
        accidental: ev.kind === "note" ? accidentalName(ev.acc) : "",
        tie: !!ev.tie,
      };
    });
  }

  function listEvents(abc) {
    return eventsFor(abc, "Vocal");
  }

  // abc2svg jianpu draws one digit per note. A rest at least a half note is
  // sliced into quarter-length 0s (1, 2, or 3 extras). A multi-bar Z is one 0 per bar.
  function digitGlyphs(ev, lDen) {
    if (ev.kind === "note") return 1;
    if (ev.kind === "zrest" && ev.bars > 1) return ev.bars;
    const half = lDen / 2;
    if (ev.units < half) return 1;
    if (ev.units >= lDen) return 4;
    if (ev.units === half) return 2;
    return 3;
  }

  function headIndexes(abc, voice) {
    const parsed = collect(abc);
    if (parsed.error) return [];
    const events = voice === "Ins" ? parsed.ins : parsed.events;
    const indexes = [];
    for (const ev of events) {
      const count = digitGlyphs(ev, parsed.header.lDen);
      for (let n = 0; n < count; n++) indexes.push(ev.index);
    }
    return indexes;
  }

  const CHORD_INTERVALS = {
    "": [0, 4, 7],
    m: [0, 3, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8],
    "7": [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    dim7: [0, 3, 6, 9],
    m7b5: [0, 3, 6, 10],
    sus4: [0, 5, 7],
    sus2: [0, 2, 7],
    "6": [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
    "7sus4": [0, 5, 7, 10],
    "m(maj7)": [0, 3, 7, 11],
  };
  const CHORD_RE = /^([A-G](?:bb|##|b|#)?)(m\(maj7\)|maj7|dim7|m7b5|7sus4|sus4|sus2|m7|m6|dim|aug|7|6|m)?(?:\/([A-G](?:bb|##|b|#)?))?$/;
  const CHORD_ACC = { bb: -2, "##": 2, b: -1, "#": 1 };

  function pitchClass(name) {
    const match = /^([A-G])(bb|##|b|#)?$/.exec(name || "");
    if (!match) return null;
    return (NATURAL[match[1]] + (CHORD_ACC[match[2]] || 0) + 12) % 12;
  }

  // Chord tones sit in the C4 octave so they stay audible on small speakers.
  // A slash bass, or the root, is added an octave below.
  function spellChord(symbol) {
    const match = CHORD_RE.exec(String(symbol || "").trim());
    if (!match) return null;
    const root = pitchClass(match[1]);
    const quality = match[2] || "";
    const bass = match[3] ? pitchClass(match[3]) : root;
    const intervals = CHORD_INTERVALS[quality];
    if (root == null || bass == null || !intervals) return null;
    const tones = [];
    for (const interval of intervals) tones.push(60 + ((root + interval) % 12));
    let low = 48 + bass;
    if (low >= 60) low -= 12;
    if (tones.indexOf(low) < 0) tones.unshift(low);
    tones.sort((a, b) => a - b);
    return tones.filter((midi, index) => tones.indexOf(midi) === index);
  }

  function scheduleVoice(events, quarter, voice) {
    let units = 0;
    let barKey = null;
    let local = {};
    const notes = [];
    const chords = [];
    for (const ev of events) {
      const key = ev.line + ":" + ev.barIndex;
      if (key !== barKey) {
        barKey = key;
        local = {};
      }
      const startQ = units * quarter;
      units += ev.units;
      if (ev.chord && spellChord(ev.chord)) chords.push({ symbol: ev.chord, startQ: startQ });
      if (ev.kind !== "note") continue;
      const midi = midiNumber(ev.letter, ev.marks, ev.acc, ev.key, local);
      if (ev.acc) local[ev.letter.toUpperCase()] = ACC[ev.acc];
      const endQ = startQ + ev.units * quarter;
      const prev = notes[notes.length - 1];
      if (ev.continuesTie && prev && prev.midi === midi && Math.abs(prev.endQ - startQ) < 1e-6) {
        prev.endQ = endQ;
        prev.indexes.push(ev.index);
        continue;
      }
      notes.push({ midi: midi, startQ: startQ, endQ: endQ, voice: voice, indexes: [ev.index] });
    }
    return { notes: notes, chords: chords, endQ: units * quarter };
  }

  function chordNotes(changes, endQ, bpm) {
    const notes = [];
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const until = i + 1 < changes.length ? changes[i + 1].startQ : endQ;
      if (until - change.startQ <= 1e-6) continue;
      const tones = spellChord(change.symbol);
      if (!tones) continue;
      const start = change.startQ * 60 / bpm;
      const duration = (until - change.startQ) * 60 / bpm;
      for (const midi of tones) {
        notes.push({
          midi: midi,
          voice: "Chord",
          start: start,
          duration: duration,
          indexes: [],
          volume: 0.16,
          velocity: 86,
        });
      }
    }
    return notes;
  }

  function timeline(abc) {
    const parsed = collect(abc);
    if (parsed.error) return { bpm: 120, notes: [], error: parsed.error };
    const quarter = 4 / parsed.header.lDen;
    const vocal = scheduleVoice(parsed.events, quarter, "Vocal");
    const ins = scheduleVoice(parsed.ins || [], quarter, "Ins");
    const bpm = parsed.header.bpm || 120;
    const notes = vocal.notes.concat(ins.notes).map((note) => ({
      midi: note.midi,
      voice: note.voice,
      start: note.startQ * 60 / bpm,
      duration: (note.endQ - note.startQ) * 60 / bpm,
      indexes: note.indexes,
    }));
    const endQ = Math.max(vocal.endQ, ins.endQ);
    return {
      bpm: bpm,
      error: null,
      notes: notes.concat(chordNotes(vocal.chords, endQ, bpm)),
    };
  }

  // One mark per drawn digit, including rest slices, so the playhead walks
  // through 0s as well as sounding notes. Vocal is listed first.
  function playMarks(abc) {
    const parsed = collect(abc);
    if (parsed.error) return [];
    const quarter = 4 / parsed.header.lDen;
    const bpm = parsed.header.bpm || 120;
    const secPerUnit = quarter * 60 / bpm;
    const marks = [];
    function walk(events, voice) {
      let units = 0;
      for (const ev of events) {
        const count = digitGlyphs(ev, parsed.header.lDen);
        const sliceUnits = count ? ev.units / count : ev.units;
        for (let slice = 0; slice < count; slice++) {
          marks.push({
            voice: voice,
            index: ev.index,
            slice: slice,
            start: (units + slice * sliceUnits) * secPerUnit,
          });
        }
        units += ev.units;
      }
    }
    walk(parsed.events, "Vocal");
    walk(parsed.ins || [], "Ins");
    return marks;
  }

  // Source scrolling follows the vocal line. Accompaniment digits sit lower
  // on the same system, so chasing whichever voice is latest yanks the page
  // up and down.
  function followMark(marks, now) {
    const vocal = [];
    for (const mark of marks || []) {
      if (!mark || mark.voice === "Vocal" || !mark.voice) vocal.push(mark);
    }
    return cursorAt(vocal.length ? vocal : marks, now);
  }

  // The glyph that playback has reached: latest start at or before now.
  // A tie stays on the vocal digit.
  function cursorAt(marks, now) {
    if (!marks || !marks.length) return null;
    let best = null;
    for (const mark of marks) {
      if (mark.start > now + 1e-3) continue;
      const later = !best || mark.start > best.start + 1e-3;
      const vocalTie = best && Math.abs(mark.start - best.start) <= 1e-3
        && mark.voice === "Vocal" && best.voice !== "Vocal";
      if (later || vocalTie) best = mark;
    }
    return best || marks[0];
  }

  function markTime(marks, voice, index, slice) {
    if (!marks || !marks.length || index == null) return null;
    const wantVoice = voice || "Vocal";
    const wantSlice = slice || 0;
    for (const mark of marks) {
      if (mark.voice === wantVoice && mark.index === index && mark.slice === wantSlice) {
        return mark.start;
      }
    }
    return null;
  }

  // Gradio 5 hands the browser a FileData object. A raw filesystem path cannot
  // be played, so only an http(s), blob, or app-relative URL is accepted.
  function fileUrl(file) {
    if (!file) return "";
    if (typeof file === "string") {
      return /^(https?:|blob:|\/)/.test(file) ? file : "";
    }
    if (typeof file.url === "string" && file.url) return file.url;
    if (typeof file.path === "string" && file.path) {
      return "/gradio_api/file=" + encodeURI(file.path.replace(/\\/g, "/"));
    }
    return "";
  }

  function inspectScore(abc) {
    const parsed = collect(abc);
    if (parsed.error) return { error: parsed.error, events: [], bpm: 120, keyName: "C" };
    return {
      error: null,
      bpm: parsed.header.bpm,
      keyName: parsed.header.key.name,
      keyLabel: jianpuKeyLabel(parsed.header.key),
      events: listEvents(abc),
    };
  }

  // Text score: one token per note, a bare number is one quarter-length beat.
  const TEXT_HEADER = /^([16])=\s*([A-G][#b]?)\s+(\d+)\s*\/\s*(\d+)\s+♩=\s*(\d+)\s*$/;
  const TEXT_NOTE = /^(##|bb|#|b|n)?([0-7])([',]*)(\/*)(\.?)(~?)/;

  function unitsFromMarks(slashes, dotted, beat) {
    const div = 1 << slashes;
    const numer = beat * (dotted ? 3 : 1);
    const denom = div * (dotted ? 2 : 1);
    if (denom <= 0 || numer % denom !== 0) return null;
    const units = numer / denom;
    return units > 0 ? units : null;
  }

  function spellDuration(units, beat) {
    if (!Number.isInteger(units) || units <= 0 || !Number.isInteger(beat) || beat <= 0) return null;
    let best = null;
    for (let slashes = 0; slashes <= 6; slashes++) {
      for (let dot = 0; dot < 2; dot++) {
        const base = unitsFromMarks(slashes, dot === 1, beat);
        if (base == null || base > units || (units - base) % beat !== 0) continue;
        const cand = { slashes: slashes, dotted: dot === 1, dashes: (units - base) / beat };
        const better = !best
          || cand.dashes < best.dashes
          || (cand.dashes === best.dashes && cand.slashes < best.slashes)
          || (cand.dashes === best.dashes && cand.slashes === best.slashes && best.dotted && !cand.dotted);
        if (better) best = cand;
      }
    }
    return best;
  }

  function relativeMark(relative) {
    if (relative === 1) return "#";
    if (relative === -1) return "b";
    if (relative === 2) return "##";
    if (relative === -2) return "bb";
    return "";
  }

  function knownKey(name) {
    return Object.prototype.hasOwnProperty.call(FIFTHS, name);
  }

  function walkBody(abc) {
    const lines = String(abc || "").split(/\r?\n/);
    const header = parseHeader(lines);
    const kIdx = lines.findIndex((line) => /^K:\s*/.test(line));
    if (kIdx < 0) return { error: "读不懂曲谱头", header: header, lines: lines, items: [] };
    let key = header.key;
    let perBar = perBarUnits(header.meter, header.lDen);
    const items = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^M:\s*\d/.test(line)) {
        const meterMatch = /^M:\s*(\d+)\s*\/\s*(\d+)/.exec(line);
        if (meterMatch) perBar = perBarUnits([Number(meterMatch[1]), Number(meterMatch[2])], header.lDen);
        i += 1;
        continue;
      }
      if (/^K:\s*/.test(line)) {
        key = keyFromName(line.slice(2));
        i += 1;
        continue;
      }
      if (i > kIdx && /^%/.test(line.trim())) {
        items.push({ type: "comment", text: line.trim() });
        i += 1;
        continue;
      }
      const voice = line === "V: Vocal" ? "Vocal" : line === "V: Ins" ? "Ins" : "";
      if (!voice) {
        i += 1;
        continue;
      }
      const startKey = key.name;
      i += 1;
      while (i < lines.length && /^(M:|K:)/.test(lines[i])) {
        if (lines[i].startsWith("M:")) {
          const meterMatch = /^M:\s*(\d+)\s*\/\s*(\d+)/.exec(lines[i]);
          if (meterMatch) perBar = perBarUnits([Number(meterMatch[1]), Number(meterMatch[2])], header.lDen);
        } else {
          key = keyFromName(lines[i].slice(2));
        }
        i += 1;
      }
      if (i >= lines.length) break;
      const scanned = scanMusic(lines[i], key, perBar);
      if (scanned.error) return { error: scanned.error, header: header, lines: lines, items: [] };
      key = scanned.key;
      i += 1;
      let wLine = null;
      if (voice === "Vocal" && i < lines.length && /^w:/.test(lines[i])) {
        wLine = lines[i];
        i += 1;
      }
      if (voice === "Vocal") assignLyrics(scanned.events, wLine);
      const bucket = voice === "Ins" ? "Ins" : "Vocal";
      let count = 0;
      for (const prev of items) {
        if (prev.type === "music" && prev.voice === bucket) count += prev.events.length;
      }
      for (const ev of scanned.events) {
        ev.voice = voice;
        ev.index = count;
        count += 1;
      }
      items.push({ type: "music", voice: voice, events: scanned.events, startKey: startKey });
    }
    return { error: null, header: header, lines: lines, kIdx: kIdx, items: items };
  }

  function layoutBars(events) {
    const bars = [];
    let origin = null;
    let extra = 0;
    function at(barIndex) {
      if (origin === null) origin = barIndex;
      const pos = barIndex - origin + extra;
      while (bars.length <= pos) bars.push([]);
      return pos;
    }
    for (const ev of events) {
      if (ev.kind === "zrest") {
        const pos = at(ev.barIndex);
        const count = ev.bars > 0 ? ev.bars : 1;
        for (let b = 0; b < count; b++) {
          while (bars.length <= pos + b) bars.push([]);
          bars[pos + b].push({
            kind: "rest",
            units: ev.perBar,
            key: ev.key,
            chord: b === 0 ? (ev.chord || "") : "",
            tie: false,
            index: ev.index,
            voice: ev.voice,
            lyric: "*",
          });
        }
        extra += count - 1;
        continue;
      }
      bars[at(ev.barIndex)].push(ev);
    }
    return bars;
  }

  function jianpuToken(ev, dur) {
    const suffix = "/".repeat(dur.slashes) + (dur.dotted ? "." : "");
    if (ev.kind !== "note") return "0" + suffix;
    const jp = readJp(ev);
    if (!jp) return null;
    const oct = jp.octave > 0 ? "'".repeat(jp.octave) : ",".repeat(-jp.octave);
    return relativeMark(jp.relative) + String(jp.degree) + oct + suffix + (ev.tie ? "~" : "");
  }

  function renderPieces(pieces) {
    let line = "";
    const marks = [];
    let active = null;
    for (let i = 0; i < pieces.length; i++) {
      if (line) line += " ";
      const piece = pieces[i];
      const start = line.length;
      line += piece.text;
      const end = line.length;
      if (piece.index == null) {
        active = null;
        continue;
      }
      if (active && active.group === piece.group) active.end = end;
      else {
        active = {
          voice: piece.voice,
          index: piece.index,
          group: piece.group,
          start: start,
          end: end,
        };
        marks.push(active);
      }
    }
    return { line: line, marks: marks };
  }

  function renderMusicLine(bars) {
    let line = "";
    const marks = [];
    for (let b = 0; b < bars.length; b++) {
      if (b) line += " | ";
      const rendered = renderPieces(bars[b]);
      const base = line.length;
      line += rendered.line;
      for (const mark of rendered.marks) {
        marks.push({
          voice: mark.voice,
          index: mark.index,
          start: base + mark.start,
          end: base + mark.end,
        });
      }
    }
    line += " |";
    return { line: line, marks: marks };
  }

  function formatLyric(events) {
    const tokens = [];
    let meaningful = false;
    for (const ev of events) {
      if (ev.kind !== "note") continue;
      const shown = displayLyricToken(ev.lyric);
      if (shown !== "·" && shown !== "-") meaningful = true;
      tokens.push({ text: shown, index: ev.index });
    }
    if (!meaningful) return { line: "", marks: [] };
    while (tokens.length && tokens[tokens.length - 1].text === "·") tokens.pop();
    if (!tokens.length) return { line: "", marks: [] };
    let line = "词";
    const marks = [];
    for (const token of tokens) {
      line += " ";
      const start = line.length;
      line += token.text;
      marks.push({
        kind: "lyric",
        voice: "Vocal",
        index: token.index,
        start: start,
        end: line.length,
      });
    }
    return { line: line, marks: marks };
  }

  function buildJianpuText(abc) {
    const walked = walkBody(abc);
    if (walked.error) return { text: "", error: walked.error, marks: [] };
    const beat = quarterUnits(walked.header.lDen);
    if (!beat) return { text: "", error: "这个曲谱的单位写不成一拍", marks: [] };
    const header = walked.header;
    let text = jianpuKeyLabel(header.key) + "  " + header.meter[0] + "/" + header.meter[1] + "  ♩=" + header.bpm;
    const marks = [];
    for (const item of walked.items) {
      if (item.type === "comment") {
        text += "\n" + item.text;
        continue;
      }
      text += "\n" + (item.voice === "Ins" ? "伴" : "唱");
      const tokened = tokensForBars(layoutBars(item.events), beat, item.startKey);
      if (tokened.error) return { text: "", error: tokened.error, marks: [] };
      const rendered = renderMusicLine(tokened.bars);
      const start = text.length + 1;
      text += "\n" + rendered.line;
      for (const mark of rendered.marks) {
        marks.push({
          voice: mark.voice,
          index: mark.index,
          start: start + mark.start,
          end: start + mark.end,
        });
      }
      if (item.voice === "Vocal") {
        const lyric = formatLyric(item.events);
        if (lyric.line) {
          const start = text.length + 1;
          text += "\n" + lyric.line;
          for (const mark of lyric.marks) {
            marks.push({
              kind: "lyric",
              voice: "Vocal",
              index: mark.index,
              start: start + mark.start,
              end: start + mark.end,
            });
          }
        }
      }
    }
    return { text: text, error: null, marks: marks };
  }

  function tokensForBars(bars, beat, startKey) {
    let running = startKey;
    let group = 0;
    const out = [];
    for (const bar of bars) {
      const tokens = [];
      for (const ev of bar) {
        const dur = spellDuration(ev.units, beat);
        if (!dur) return { error: "这个时值写不成文本谱" };
        const id = group;
        group += 1;
        if (ev.key && ev.key.name !== running) {
          tokens.push({ text: "[K:" + ev.key.name + "]", voice: ev.voice, index: ev.index, group: id });
          running = ev.key.name;
        }
        if (ev.chord) {
          tokens.push({ text: '"' + ev.chord + '"', voice: ev.voice, index: ev.index, group: id });
        }
        const written = jianpuToken(ev, dur);
        if (!written) return { error: "这个音写不成文本谱" };
        tokens.push({ text: written, voice: ev.voice, index: ev.index, group: id });
        for (let dash = 0; dash < dur.dashes; dash++) {
          tokens.push({ text: "-", voice: ev.voice, index: ev.index, group: id });
        }
      }
      out.push(tokens);
    }
    return { bars: out };
  }

  function formatJianpuText(abc) {
    return buildJianpuText(abc).text || "";
  }

  function scanTextTokens(line) {
    const items = [];
    let i = 0;
    while (i < line.length) {
      if (/\s/.test(line[i])) {
        i += 1;
        continue;
      }
      if (line[i] === "|") {
        items.push({ kind: "bar", start: i, end: i + 1 });
        i += 1;
        continue;
      }
      if (line[i] === "-" && (i + 1 === line.length || /[\s|]/.test(line[i + 1]))) {
        items.push({ kind: "dash", start: i, end: i + 1 });
        i += 1;
        continue;
      }
      if (line[i] === '"') {
        const end = line.indexOf('"', i + 1);
        if (end < 0) return { error: "和弦没有写完" };
        items.push({ kind: "chord", text: line.slice(i + 1, end), start: i, end: end + 1 });
        i = end + 1;
        continue;
      }
      if (line.startsWith("[K:", i)) {
        const end = line.indexOf("]", i);
        if (end < 0) return { error: "转调没有写完" };
        items.push({ kind: "key", text: line.slice(i + 3, end).trim(), start: i, end: end + 1 });
        i = end + 1;
        continue;
      }
      const match = TEXT_NOTE.exec(line.slice(i));
      if (!match) {
        let j = i;
        while (j < line.length && !/[\s|]/.test(line[j])) j += 1;
        return { error: "读不懂这个记号：" + line.slice(i, j) };
      }
      const oct = match[3] || "";
      if (oct.indexOf("'") >= 0 && oct.indexOf(",") >= 0) return { error: "读不懂这个记号：八度" };
      items.push({
        kind: "note",
        acc: match[1] || "",
        degree: Number(match[2]),
        oct: oct,
        slashes: (match[4] || "").length,
        dotted: match[5] === ".",
        tie: match[6] === "~",
        start: i,
        end: i + match[0].length,
      });
      i += match[0].length;
    }
    return { items: items };
  }

  function textRelative(acc, degree, key) {
    const stepIdx = ((degreeTonic(key) + degree - 1) % 7 + 7) % 7;
    if (acc === "n") return -keyAlter(stepIdx, key.fifths);
    if (acc === "#") return 1;
    if (acc === "##") return 2;
    if (acc === "b") return -1;
    if (acc === "bb") return -2;
    return 0;
  }

  function buildTextNote(item, key, beat, chord) {
    const octave = (item.oct.split("'").length - 1) - (item.oct.split(",").length - 1);
    const base = unitsFromMarks(item.slashes, item.dotted, beat);
    if (base == null) return { error: "这个时值写不进曲谱" };
    if (item.degree === 0) {
      if (item.acc) return { error: "休止没有升降号" };
      if (item.oct) return { error: "休止没有八度" };
      if (item.tie) return { error: "休止不能连音" };
      return {
        event: {
          kind: "rest",
          units: base,
          bars: 1,
          chord: chord || "",
          tie: false,
          key: cloneKey(key),
          lyric: "*",
          degree: 0,
          octave: 0,
          relative: 0,
          acc: "",
          letter: "z",
          marks: "",
        },
      };
    }
    const relative = textRelative(item.acc, item.degree, key);
    const spelled = spell(item.degree, octave, key, relative);
    if (!spelled) return { error: "这个音超出音域" };
    const midi = midiNumber(spelled.letter, spelled.marks, spelled.acc, key, null);
    if (midi < 0 || midi > 127) return { error: "这个音超出音域" };
    return {
      event: {
        kind: "note",
        units: base,
        bars: 1,
        chord: chord || "",
        tie: !!item.tie,
        key: cloneKey(key),
        lyric: "*",
        degree: item.degree,
        octave: octave,
        relative: relative,
        acc: spelled.acc,
        letter: spelled.letter,
        marks: spelled.marks,
      },
    };
  }

  function parseMusicLine(raw, lineStart, beat, startKey) {
    const scanned = scanTextTokens(raw);
    if (scanned.error) return scanned;
    let key = cloneKey(startKey);
    let pendingChord = "";
    let pendingStart = null;
    let current = null;
    const bars = [[]];
    function closeNote() {
      if (!current) return;
      bars[bars.length - 1].push(current);
      current = null;
    }
    for (const item of scanned.items) {
      if (item.kind === "bar") {
        closeNote();
        bars.push([]);
        pendingChord = "";
        pendingStart = null;
        continue;
      }
      if (item.kind === "dash") {
        if (!current) {
          const any = bars.some((bar) => bar.length);
          return { error: any ? "延长线不能跨过小节" : "延长线前面没有音" };
        }
        current.units += beat;
        current.markEnd = lineStart + item.end;
        continue;
      }
      if (item.kind === "chord") {
        closeNote();
        if (!CHORD_RE.test(item.text)) return { error: "这个和弦写不进曲谱" };
        pendingChord = item.text;
        pendingStart = item.start;
        continue;
      }
      if (item.kind === "key") {
        closeNote();
        const next = keyFromName(item.text);
        if (!knownKey(next.name)) return { error: "这个转调写不进曲谱" };
        key = next;
        continue;
      }
      closeNote();
      const built = buildTextNote(item, key, beat, pendingChord);
      if (built.error) return built;
      built.event.markStart = lineStart + (pendingStart == null ? item.start : pendingStart);
      built.event.markEnd = lineStart + item.end;
      current = built.event;
      pendingChord = "";
      pendingStart = null;
    }
    closeNote();
    while (bars.length && !bars[0].length) bars.shift();
    while (bars.length && !bars[bars.length - 1].length) bars.pop();
    if (!bars.length) return { error: "没有音符" };
    return { bars: bars };
  }

  function groupMusic(items) {
    const groups = [];
    let vocal = null;
    let ins = null;
    function flush() {
      if (!vocal && !ins) return;
      groups.push({ vocal: vocal, ins: ins });
      vocal = null;
      ins = null;
    }
    for (const item of items) {
      if (item.type === "comment") {
        flush();
        groups.push({ comment: item.text });
        continue;
      }
      if (item.voice === "Vocal") {
        if (vocal) flush();
        vocal = item;
        if (ins) flush();
      } else {
        if (ins) flush();
        ins = item;
        if (vocal) flush();
      }
    }
    flush();
    return groups;
  }

  function sameWritten(a, b) {
    return a && b && a.kind === "note" && b.kind === "note"
      && a.degree === b.degree && a.octave === b.octave && a.relative === b.relative
      && a.key.name === b.key.name;
  }

  function flattenBars(item) {
    const events = [];
    if (!item) return events;
    for (const bar of item.bars) {
      for (const ev of bar) events.push(ev);
    }
    return events;
  }

  function textWarnings(items, perBar) {
    const warnings = [];
    function push(message) {
      if (warnings.indexOf(message) < 0) warnings.push(message);
    }
    let music = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type !== "comment") continue;
      let j = i + 1;
      while (j < items.length && items[j].type === "comment") j += 1;
      if (j >= items.length || items[j].type !== "music") push("这一段还没有谱");
    }
    function checkLine(item) {
      if (!item) return;
      if (item.bars.length < 1 || item.bars.length > 4) push("一行最多四个小节");
      for (const bar of item.bars) {
        if (!bar.length) {
          push("有一个空小节");
          continue;
        }
        let units = 0;
        for (const ev of bar) {
          units += ev.units;
          if (!DURATIONS.has(ev.units)) push("这个时值写不进曲谱");
          if (item.voice === "Ins" && ev.chord) push("和弦要写在唱谱上");
        }
        if (units !== perBar) push((item.voice === "Ins" ? "伴" : "唱") + "的小节拍数对不上");
      }
    }
    function checkTies(events) {
      for (let i = 0; i < events.length; i++) {
        if (!events[i].tie) continue;
        if (!sameWritten(events[i], events[i + 1])) push("连音要接在后面同样的音上");
      }
    }
    const vocalEvents = [];
    const insEvents = [];
    for (const group of groupMusic(items)) {
      if (group.comment) continue;
      music += 1;
      checkLine(group.vocal);
      checkLine(group.ins);
      if (!group.vocal || !group.ins) push("唱和伴的小节对不上");
      else if (group.vocal.bars.length !== group.ins.bars.length) push("唱和伴的小节对不上");
      else {
        for (let b = 0; b < group.vocal.bars.length; b++) {
          const left = group.vocal.bars[b][0];
          const right = group.ins.bars[b][0];
          if (left && right && left.key.name !== right.key.name) push("唱和伴的转调对不上");
        }
      }
      for (const ev of flattenBars(group.vocal)) vocalEvents.push(ev);
      for (const ev of flattenBars(group.ins)) insEvents.push(ev);
    }
    if (!music) push("先写唱和伴");
    checkTies(vocalEvents);
    checkTies(insEvents);
    return warnings;
  }

  function abcPiece(ev, state) {
    let text = "";
    if (ev.key.name !== state.key) {
      text += "[K:" + ev.key.name + "]";
      state.key = ev.key.name;
    }
    if (ev.chord) text += '"' + ev.chord + '"';
    text += printToken(ev);
    return text;
  }

  function lyricAbc(item) {
    const tokens = [];
    for (const ev of flattenBars(item)) {
      if (ev.kind === "note") tokens.push(lyricToken(ev));
    }
    if (!tokens.some((token) => token !== "*" && token !== "-")) return "";
    while (tokens.length && tokens[tokens.length - 1] === "*") tokens.pop();
    return tokens.length ? "w: " + tokens.join(" ") : "";
  }

  function bodyFromText(items, keyName) {
    const lines = [];
    for (const group of groupMusic(items)) {
      if (group.comment) {
        lines.push(group.comment);
        continue;
      }
      if (group.vocal) {
        const state = { key: keyName };
        lines.push("V: Vocal");
        lines.push(group.vocal.bars.map((bar) => bar.map((ev) => abcPiece(ev, state)).join(" ")).join(" | ") + "|");
        const lyric = lyricAbc(group.vocal);
        if (lyric) lines.push(lyric);
      }
      if (group.ins) {
        const state = { key: keyName };
        lines.push("V: Ins");
        lines.push(group.ins.bars.map((bar) => bar.map((ev) => abcPiece(ev, state)).join(" ")).join(" | ") + "|");
      }
    }
    return lines;
  }

  function applyTextHeader(baseLines, headerEnd, meter, bpm, keyName) {
    const out = baseLines.slice(0, headerEnd + 1);
    let wroteMeter = false;
    let wroteTempo = false;
    for (let i = 0; i < out.length; i++) {
      if (!wroteMeter && /^M:/.test(out[i])) {
        out[i] = "M:" + meter[0] + "/" + meter[1];
        wroteMeter = true;
      } else if (!wroteTempo && /^Q:/.test(out[i])) {
        out[i] = "Q:1/4=" + bpm;
        wroteTempo = true;
      } else if (i === headerEnd) {
        out[i] = "K:" + keyName;
      }
    }
    return out;
  }

  function parseJianpuText(text, baseAbc) {
    const base = String(baseAbc || "");
    const baseLines = base.split(/\r?\n/);
    const headerEnd = baseLines.findIndex((line) => /^K:\s*/.test(line));
    if (headerEnd < 0) return { abc: null, error: "读不懂曲谱头", warning: null, note: null, marks: [] };
    const baseHeader = parseHeader(baseLines);
    const beat = quarterUnits(baseHeader.lDen);
    if (!beat) return { abc: null, error: "这个曲谱的单位写不成一拍", warning: null, note: null, marks: [] };
    let meter = baseHeader.meter.slice();
    let bpm = baseHeader.bpm;
    let key = cloneKey(baseHeader.key);
    const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = source.split("\n");
    const starts = [];
    let cursor = 0;
    for (let i = 0; i < lines.length; i++) {
      starts.push(cursor);
      cursor += lines[i].length + 1;
    }
    const items = [];
    let voice = null;
    let sawContent = false;
    let note = null;
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li];
      const trim = raw.trim();
      if (!trim) continue;
      if (!sawContent && /^[1-7]=/.test(trim)) {
        const match = TEXT_HEADER.exec(trim);
        const labeled = match && keyFromJianpuLabel(match[1], match[2]);
        if (!match || !labeled) {
          return { abc: null, error: "第 " + (li + 1) + " 行：调号读不懂", warning: null, note: null, marks: [] };
        }
        const nextMeter = [Number(match[3]), Number(match[4])];
        const per = perBarUnits(nextMeter, baseHeader.lDen);
        if (!nextMeter[0] || !nextMeter[1] || !Number.isInteger(per) || per <= 0 || (nextMeter[1] & (nextMeter[1] - 1)) !== 0) {
          return { abc: null, error: "这个拍号写不进曲谱", warning: null, note: null, marks: [] };
        }
        const tempo = Number(match[5]);
        if (!tempo) return { abc: null, error: "速度要写成正整数", warning: null, note: null, marks: [] };
        meter = nextMeter;
        bpm = tempo;
        key = labeled;
        sawContent = true;
        continue;
      }
      sawContent = true;
      if (/^%/.test(trim)) {
        voice = null;
        items.push({ type: "comment", text: trim });
        continue;
      }
      if (trim === "唱" || trim === "伴") {
        voice = trim === "伴" ? "Ins" : "Vocal";
        continue;
      }
      if (trim.startsWith("词")) {
        if (voice === "Ins") {
          return { abc: null, error: "第 " + (li + 1) + " 行：伴奏没有歌词", warning: null, note: null, marks: [] };
        }
        let vocalItem = null;
        for (let prev = items.length - 1; prev >= 0; prev--) {
          if (items[prev].type === "music" && items[prev].voice === "Vocal") {
            vocalItem = items[prev];
            break;
          }
        }
        if (!vocalItem) {
          return { abc: null, error: "第 " + (li + 1) + " 行：词没有唱谱", warning: null, note: null, marks: [] };
        }
        if (vocalItem.lyricSet) {
          return { abc: null, error: "第 " + (li + 1) + " 行：这一行已经有词", warning: null, note: null, marks: [] };
        }
        const spans = lyricLineSpans(raw);
        const notes = flattenBars(vocalItem).filter((ev) => ev.kind === "note");
        for (let n = 0; n < notes.length; n++) {
          const span = n < spans.length ? spans[n] : null;
          notes[n].lyric = span && span.token ? span.token : "*";
          if (!span) continue;
          notes[n].lyricMarkStart = starts[li] + span.start;
          notes[n].lyricMarkEnd = starts[li] + span.end;
        }
        const extra = Math.max(0, spans.length - notes.length);
        if (extra && !note) note = "还有 " + extra + " 个字没有音符";
        vocalItem.lyricSet = true;
        continue;
      }
      if (!voice) {
        return { abc: null, error: "第 " + (li + 1) + " 行：要写在唱或伴下面", warning: null, note: null, marks: [] };
      }
      const parsed = parseMusicLine(raw, starts[li], beat, key);
      if (parsed.error) {
        return { abc: null, error: "第 " + (li + 1) + " 行：" + parsed.error, warning: null, note: null, marks: [] };
      }
      items.push({ type: "music", voice: voice, bars: parsed.bars, lyricSet: false });
    }
    const perBar = perBarUnits(meter, baseHeader.lDen);
    const warnings = textWarnings(items, perBar);
    const counters = { Vocal: 0, Ins: 0 };
    const marks = [];
    for (const item of items) {
      if (item.type !== "music") continue;
      for (const bar of item.bars) {
        for (const ev of bar) {
          ev.index = counters[item.voice];
          counters[item.voice] += 1;
          ev.voice = item.voice;
          if (ev.markStart != null) {
            marks.push({
              voice: item.voice,
              index: ev.index,
              start: ev.markStart,
              end: ev.markEnd,
            });
          }
          if (ev.lyricMarkStart != null) {
            marks.push({
              kind: "lyric",
              voice: "Vocal",
              index: ev.index,
              start: ev.lyricMarkStart,
              end: ev.lyricMarkEnd,
            });
          }
        }
      }
    }
    const header = applyTextHeader(baseLines, headerEnd, meter, bpm, key.name);
    let abc = header.concat(bodyFromText(items, key.name)).join("\n");
    if (base.endsWith("\n")) abc += "\n";
    return { abc: abc, error: null, warning: warnings[0] || null, note: note, marks: marks };
  }

  const JIANPU_DOT = "\ue1e7";
  const JIANPU_ACC = {
    "\ue262": "#",
    "\ue260": "b",
    "\ue263": "##",
    "\ue264": "bb",
    "\ue261": "n",
  };

  function describeWritten(note) {
    if (!note || note.degree === 0) return "0";
    const oct = note.octave > 0 ? "'".repeat(note.octave) : ",".repeat(-note.octave);
    return (note.acc || "") + String(note.degree) + oct;
  }

  function describeShown(head) {
    if (!head || head.digit === "0") return "0";
    const oct = head.octave > 0 ? "'".repeat(head.octave) : ",".repeat(-head.octave);
    return (head.acc || "") + head.digit + oct;
  }

  function writtenNotes(text, beat) {
    if (!beat) return { error: "这个曲谱的单位写不成一拍" };
    const voices = { Vocal: [], Ins: [] };
    let voice = null;
    let saw = false;
    const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (const raw of lines) {
      const trim = raw.trim();
      if (!trim) continue;
      if (!saw && /^[1-7]=/.test(trim)) {
        saw = true;
        continue;
      }
      saw = true;
      if (/^%/.test(trim)) {
        voice = null;
        continue;
      }
      if (trim === "唱" || trim === "伴") {
        voice = trim === "伴" ? "Ins" : "Vocal";
        continue;
      }
      if (trim.startsWith("词")) continue;
      if (!voice) return { error: "要写在唱或伴下面" };
      const scanned = scanTextTokens(raw);
      if (scanned.error) return scanned;
      let current = null;
      const flush = () => {
        if (!current) return;
        voices[voice].push(current);
        current = null;
      };
      for (const item of scanned.items) {
        if (item.kind === "bar" || item.kind === "chord" || item.kind === "key") {
          flush();
          continue;
        }
        if (item.kind === "dash") {
          if (!current) return { error: "延长线前面没有音" };
          current.units += beat;
          continue;
        }
        flush();
        if (item.degree === 0 && (item.acc || item.oct || item.tie)) {
          return { error: "休止没有升降号" };
        }
        const units = unitsFromMarks(item.slashes, item.dotted, beat);
        if (units == null) return { error: "这个时值写不进曲谱" };
        const octave = (item.oct.split("'").length - 1) - (item.oct.split(",").length - 1);
        current = {
          degree: item.degree,
          octave: item.degree === 0 ? 0 : octave,
          acc: item.degree === 0 ? "" : (item.acc || ""),
          units: units,
        };
      }
      flush();
    }
    return { voices: voices };
  }

  function decodeSvgText(body) {
    return String(body || "")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
  }

  function shownNotes(svg) {
    const voices = { Vocal: [], Ins: [] };
    const re = /<text\b([^>]*)>([^<]*)<\/text>/g;
    let open = null;
    let match;
    while ((match = re.exec(String(svg || "")))) {
      const attrs = match[1];
      const body = decodeSvgText(match[2]);
      const cls = (/class="([^"]*)"/.exec(attrs) || [])[1] || "";
      if (/(?:^|\s)fj(?:\s|$)/.test(cls)) {
        open = null;
        const voice = /(?:^|\s)v-Ins(?:\s|$)/.test(cls) ? "Ins"
          : /(?:^|\s)v-Vocal(?:\s|$)/.test(cls) ? "Vocal" : "";
        if (!voice || !/^[0-7]$/.test(body)) continue;
        const x = Number((/\bx="([0-9.]+)"/.exec(attrs) || [])[1]);
        const y = Number((/\by="([0-9.]+)"/.exec(attrs) || [])[1]);
        open = { digit: body, octave: 0, acc: "", x: x, y: y };
        voices[voice].push(open);
        continue;
      }
      if (!open) continue;
      if (/(?:^|\s)jacc(?:\s|$)/.test(cls)) {
        if (JIANPU_ACC[body]) open.acc = JIANPU_ACC[body];
        continue;
      }
      if (body !== JIANPU_DOT) continue;
      const x = Number((/\bx="([0-9.]+)"/.exec(attrs) || [])[1]);
      const y = Number((/\by="([0-9.]+)"/.exec(attrs) || [])[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(open.x)) continue;
      if (x - open.x >= 6) continue;
      open.octave += y < open.y ? 1 : -1;
    }
    return voices;
  }

  // A rest written with dashes is one text note. Jianpu draws a sliced rest as
  // several 0s, and a multi-bar Z as one 0 per bar. Either drawing agrees.
  function sameAcc(written, shown) {
    const left = written || "";
    const right = shown || "";
    if (left === right) return true;
    const courtesy = (mark) => mark === "" || mark === "n";
    return courtesy(left) && courtesy(right);
  }

  function alignVoice(written, shown, voice, lDen, perBar) {
    const marks = [];
    let message = "";
    let j = 0;
    let ordinal = 0;
    const name = voice === "Ins" ? "伴" : "唱";
    const fail = (text) => {
      if (!message) message = name + text;
    };
    for (let i = 0; i < written.length;) {
      const item = written[i];
      if (item.degree !== 0) {
        ordinal += 1;
        const head = shown[j];
        const want = describeWritten(item);
        const printed = head ? describeShown(head) : "";
        const same = head && String(item.degree) === head.digit
          && (item.octave || 0) === (head.octave || 0)
          && sameAcc(item.acc, head.acc);
        if (!head) fail("第 " + ordinal + " 个音：文本是 " + want + "，谱上没有");
        else if (!same) {
          fail("第 " + ordinal + " 个音：文本是 " + want + "，谱上是 " + printed);
          marks.push({ voice: voice, glyph: j });
        }
        if (head) j += 1;
        i += 1;
        continue;
      }
      const start = ordinal + 1;
      const run = [];
      while (i < written.length && written[i].degree === 0) {
        run.push(written[i]);
        i += 1;
        ordinal += 1;
      }
      let zeros = 0;
      while (shown[j + zeros] && shown[j + zeros].digit === "0"
        && !shown[j + zeros].acc && !shown[j + zeros].octave) {
        zeros += 1;
      }
      const glyphCount = (note) => digitGlyphs({ kind: "rest", units: note.units }, lDen);
      // A bar of Z2–Z4 is one 0. The same bar written as z is sliced
      // into quarter 0s. Only a full bar may be either drawing.
      const canTake = new Array(zeros + 1).fill(false);
      canTake[0] = true;
      for (const note of run) {
        const need = glyphCount(note);
        const next = new Array(zeros + 1).fill(false);
        for (let used = 0; used <= zeros; used++) {
          if (!canTake[used]) continue;
          if (used + need <= zeros) next[used + need] = true;
          if (perBar > 0 && note.units === perBar && need !== 1 && used + 1 <= zeros) next[used + 1] = true;
        }
        for (let used = 0; used <= zeros; used++) canTake[used] = next[used];
      }
      const expanded = run.reduce((sum, note) => sum + glyphCount(note), 0);
      if (canTake[zeros]) {
        j += zeros;
        continue;
      }
      if (zeros === 0 && shown[j]) {
        fail("第 " + start + " 个音：文本是 0，谱上是 " + describeShown(shown[j]));
        marks.push({ voice: voice, glyph: j });
        j += 1;
        continue;
      }
      fail("第 " + start + " 个音：文本是 " + expanded + " 个 0，谱上是 " + zeros + " 个 0");
      for (let n = 0; n < zeros; n++) marks.push({ voice: voice, glyph: j + n });
      j += zeros;
    }
    while (shown[j]) {
      fail("多了音：谱上是 " + describeShown(shown[j]));
      marks.push({ voice: voice, glyph: j });
      j += 1;
    }
    return { message: message, marks: marks };
  }

  function compareJianpuNotes(text, svg, beat, lDen, perBar) {
    const written = writtenNotes(text, beat);
    if (written.error) {
      return { ok: false, unreadable: true, message: "文本还读不懂，没法对谱", marks: [] };
    }
    const shown = shownNotes(svg);
    const vocal = alignVoice(written.voices.Vocal, shown.Vocal, "Vocal", lDen, perBar || 0);
    const ins = alignVoice(written.voices.Ins, shown.Ins, "Ins", lDen, perBar || 0);
    const marks = vocal.marks.concat(ins.marks);
    const message = vocal.message || ins.message;
    if (message) return { ok: false, unreadable: false, message: message, marks: marks };
    return { ok: true, unreadable: false, message: "和简谱一致", marks: [] };
  }

  function textMarkFor(marks, voice, index) {
    const group = textMarksFor(marks, voice, index);
    return group.length ? group[0] : null;
  }

  function textMarksFor(marks, voice, index) {
    if (!marks || index == null || index < 0) return [];
    const want = voice || "Vocal";
    const found = [];
    for (let i = 0; i < marks.length; i++) {
      const mark = marks[i];
      if (mark && mark.kind !== "lyric" && mark.voice === want && mark.index === index) found.push(mark);
    }
    return found;
  }

  // Chord and key tokens sit in front of the degree. A rest's dashes are the
  // later slices. A multi-bar rest repeats the index, one mark per bar.
  function glyphTokens(body) {
    const tokens = [];
    let i = 0;
    while (i < body.length) {
      const ch = body[i];
      if (/\s/.test(ch) || ch === "|") {
        i += 1;
        continue;
      }
      if (ch === '"') {
        const end = body.indexOf('"', i + 1);
        if (end < 0) break;
        i = end + 1;
        continue;
      }
      if (body.startsWith("[K:", i)) {
        const end = body.indexOf("]", i);
        if (end < 0) break;
        i = end + 1;
        continue;
      }
      if (ch === "-" && (i + 1 === body.length || /[\s|]/.test(body[i + 1]))) {
        tokens.push({ start: i, end: i + 1 });
        i += 1;
        continue;
      }
      const match = TEXT_NOTE.exec(body.slice(i));
      if (!match) break;
      tokens.push({ start: i, end: i + match[0].length });
      i += match[0].length;
    }
    return tokens;
  }

  // Indexes of lyric marks that overlap [start, end). A caret just after a
  // syllable still counts as that syllable when the next one does not start there.
  function lyricIndexesInSelection(marks, start, end) {
    const from = Math.min(Number(start) || 0, Number(end) || 0);
    const to = Math.max(Number(start) || 0, Number(end) || 0);
    const hits = [];
    const seen = new Set();
    const add = (mark) => {
      if (mark.index == null || seen.has(mark.index)) return;
      seen.add(mark.index);
      hits.push(mark.index);
    };
    if (from === to) {
      let edge = null;
      for (const mark of marks || []) {
        if (!mark || mark.kind !== "lyric") continue;
        if (from >= mark.start && from < mark.end) {
          add(mark);
          return hits;
        }
        if (from === mark.end) edge = mark;
      }
      if (edge) add(edge);
      return hits;
    }
    for (const mark of marks || []) {
      if (!mark || mark.kind !== "lyric") continue;
      if (from < mark.end && to > mark.start) add(mark);
    }
    return hits;
  }

  function textSpanFor(text, marks, voice, index, slice) {
    const group = textMarksFor(marks, voice, index);
    if (!group.length || text == null) return null;
    const want = slice || 0;
    const several = group.length > 1;
    const mark = several ? group[Math.max(0, Math.min(want, group.length - 1))] : group[0];
    const body = String(text).slice(mark.start, mark.end);
    const tokens = glyphTokens(body);
    if (!tokens.length) return { start: mark.start, end: mark.end };
    const token = tokens[several ? 0 : Math.max(0, Math.min(want, tokens.length - 1))];
    return { start: mark.start + token.start, end: mark.start + token.end };
  }

  const TEXT_SCROLL_MARGIN = 8;

  // Content pixels. Null when the span already sits inside the viewport.
  function textScrollTarget(scrollTop, clientHeight, spanTop, spanBottom, margin) {
    const top = Number(scrollTop) || 0;
    const height = Number(clientHeight) || 0;
    const start = Number(spanTop);
    const end = Number(spanBottom);
    const pad = Number(margin);
    const gap = Number.isFinite(pad) ? pad : TEXT_SCROLL_MARGIN;
    if (!(height > 0) || !Number.isFinite(start) || !Number.isFinite(end)) return null;
    const spanStart = Math.min(start, end);
    const spanEnd = Math.max(start, end);
    if (spanStart < top + gap) return Math.max(0, spanStart - gap);
    if (spanEnd > top + height - gap) return Math.max(0, spanEnd - height + gap);
    return null;
  }

  function textSpanBox(textarea, start, end) {
    if (!textarea || typeof document === "undefined" || !document.body) return null;
    if (!textarea.clientHeight || !textarea.clientWidth) return null;
    const view = typeof getComputedStyle === "function" ? getComputedStyle(textarea) : null;
    if (!view) return null;
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.overflow = "hidden";
    mirror.style.boxSizing = "border-box";
    mirror.style.width = textarea.clientWidth + "px";
    mirror.style.height = "auto";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflowWrap = "break-word";
    mirror.style.border = "0";
    [
      "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
      "letterSpacing", "wordSpacing", "textIndent",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    ].forEach((name) => {
      mirror.style[name] = view[name];
    });
    const value = String(textarea.value || "");
    const from = Math.max(0, Math.min(start, value.length));
    const to = Math.max(from, Math.min(end == null ? from : end, value.length));
    mirror.appendChild(document.createTextNode(value.slice(0, from)));
    const mark = document.createElement("span");
    mark.textContent = value.slice(from, to) || "\u200b";
    mirror.appendChild(mark);
    document.body.appendChild(mirror);
    const boxTop = mark.offsetTop;
    const boxBottom = boxTop + mark.offsetHeight;
    mirror.remove();
    return { top: boxTop, bottom: Math.max(boxTop, boxBottom) };
  }

  const TEXT_WIDTH_KEY = "yue-jp-text-width";
  const TEXT_WIDTH_DEFAULT = 420;
  const DIAGRAM_KEY = "yue-jp-chord-diagram";

  function readSavedDiagram() {
    try {
      if (typeof localStorage === "undefined") return DIAGRAM_OFF;
      return normalizeDiagram(localStorage.getItem(DIAGRAM_KEY));
    } catch (_err) {
      return DIAGRAM_OFF;
    }
  }

  function writeSavedDiagram(kind) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(DIAGRAM_KEY, normalizeDiagram(kind));
    } catch (_err) {
      /* private mode and file pages can reject storage */
    }
  }

  function currentDiagram() {
    if (ui.diagram) return normalizeDiagram(ui.diagram.value);
    return readSavedDiagram();
  }

  const TEXT_WIDTH_MIN = 220;
  const PAPER_WIDTH_MIN = 240;
  const SPLITTER_WIDTH = 8;
  const TEXT_WIDTH_STEP = 16;

  function clampTextWidth(bodyWidth, requested) {
    const body = Math.max(0, Number(bodyWidth) || 0);
    const available = Math.max(0, body - SPLITTER_WIDTH);
    const want = Number(requested);
    const width = Number.isFinite(want) ? want : TEXT_WIDTH_DEFAULT;
    let min = TEXT_WIDTH_MIN;
    let max = available - PAPER_WIDTH_MIN;
    if (max < min) {
      if (available > PAPER_WIDTH_MIN) {
        min = available - PAPER_WIDTH_MIN;
        max = min;
      } else if (available > 1) {
        min = 1;
        max = 1;
      } else {
        return Math.round(available);
      }
    }
    return Math.round(Math.min(max, Math.max(min, width)));
  }

  function readSavedTextWidth() {
    try {
      if (typeof localStorage === "undefined") return TEXT_WIDTH_DEFAULT;
      const raw = localStorage.getItem(TEXT_WIDTH_KEY);
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return TEXT_WIDTH_DEFAULT;
      return n;
    } catch (_err) {
      return TEXT_WIDTH_DEFAULT;
    }
  }

  function writeSavedTextWidth(px) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(TEXT_WIDTH_KEY, String(px));
    } catch (_err) {
      /* private mode and file pages can reject storage */
    }
  }

  const ui = {
    abc: "",
    index: -1,
    voice: "Vocal",
    slice: 0,
    resolve: null,
    nodes: [],
    generation: 0,
    arming: false,
    ctx: null,
    osc: [],
    raf: 0,
    pointerPicked: false,
    playhead: null,
    playKey: "",
    audioUrl: "",
    audio: null,
    transport: "midi",
    marks: [],
    sourceTouched: false,
    midiPlaying: false,
    midiOffset: 0,
    midiStartedAt: 0,
    midiTotal: 0,
    sourceAbc: "",
    text: null,
    textTimer: 0,
    textSilent: false,
    textDirty: false,
    textBlocked: false,
    textError: "",
    textMarks: [],
    lyricSelection: null,
    layoutRaf: 0,
    saveButton: null,
    saveNote: null,
    saveObserver: null,
    savePoll: 0,
    saveWatch: 0,
    savedNote: false,
  };

  function applyTextWidth(px, persist) {
    if (!ui.textPane || !ui.body) return 0;
    const bodyWidth = ui.body.getBoundingClientRect().width;
    if (bodyWidth < 1) return 0;
    const width = clampTextWidth(bodyWidth, px);
    ui.textPane.style.flex = "0 0 " + width + "px";
    ui.textPane.style.width = width + "px";
    ui.textPane.style.maxWidth = "none";
    if (ui.split) {
      ui.split.setAttribute("aria-valuemin", String(TEXT_WIDTH_MIN));
      ui.split.setAttribute("aria-valuemax", String(clampTextWidth(bodyWidth, 1e9)));
      ui.split.setAttribute("aria-valuenow", String(width));
    }
    if (persist) writeSavedTextWidth(width);
    scheduleScoreLayout();
    return width;
  }

  function scheduleScoreLayout() {
    if (ui.layoutRaf) return;
    const raf = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 16);
    ui.layoutRaf = raf(() => {
      ui.layoutRaf = 0;
      layoutScoreOverlays();
    });
  }

  function layoutScoreOverlays() {
    if (!ui.paper) return;
    stampLyrics();
    if (ui.lyricSelection && ui.lyricSelection.length) markLyricSelection(ui.lyricSelection);
  }

  function bindSplitter() {
    const split = ui.split;
    if (!split || split.dataset.bound) return;
    split.dataset.bound = "1";
    let drag = null;
    let lastDown = 0;

    function endDrag(ev) {
      if (!drag || (ev && ev.pointerId !== drag.id)) return;
      drag = null;
      if (ui.root) ui.root.classList.remove("yue-jp-dragging");
      split.classList.remove("dragging");
      const width = ui.textPane ? ui.textPane.getBoundingClientRect().width : 0;
      if (width > 0) writeSavedTextWidth(Math.round(width));
      scheduleScoreLayout();
    }

    split.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const now = Date.now();
      if (now - lastDown < 400) {
        lastDown = 0;
        endDrag(ev);
        applyTextWidth(TEXT_WIDTH_DEFAULT, true);
        return;
      }
      lastDown = now;
      split.focus();
      if (split.setPointerCapture) split.setPointerCapture(ev.pointerId);
      drag = {
        id: ev.pointerId,
        x: ev.clientX,
        width: ui.textPane.getBoundingClientRect().width,
      };
      if (ui.root) ui.root.classList.add("yue-jp-dragging");
      split.classList.add("dragging");
    });
    split.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      applyTextWidth(drag.width + (ev.clientX - drag.x), false);
    });
    split.addEventListener("pointerup", endDrag);
    split.addEventListener("pointercancel", endDrag);
    split.addEventListener("dblclick", () => {
      applyTextWidth(TEXT_WIDTH_DEFAULT, true);
    });
    split.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      ev.stopPropagation();
      const current = ui.textPane.getBoundingClientRect().width;
      const delta = ev.key === "ArrowRight" ? TEXT_WIDTH_STEP : -TEXT_WIDTH_STEP;
      applyTextWidth(current + delta, true);
    });
    if (typeof ResizeObserver !== "undefined" && ui.body) {
      const observer = new ResizeObserver(() => {
        if (!ui.root || ui.root.hidden || !ui.textPane) return;
        applyTextWidth(ui.textPane.getBoundingClientRect().width, false);
      });
      observer.observe(ui.body);
    }
  }

  function ensureDom() {
    if (ui.root || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = [
      ".yue-jp-editor{position:fixed;inset:0;z-index:80;background:rgba(11,13,20,.72);",
      "display:flex;align-items:stretch;justify-content:center;padding:12px;}",
      ".yue-jp-editor[hidden]{display:none;}",
      ".yue-jp-card{width:100%;height:100%;max-height:100%;min-height:0;",
      "background:#f6e9c8;color:#2a1f12;border-radius:16px;",
      "box-shadow:0 24px 60px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;}",
      ".yue-jp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 14px;",
      "background:#1a140e;color:#f6e9c8;}",
      ".yue-jp-bar h2{margin:0 8px 0 0;font-size:16px;font-weight:650;}",
      ".yue-jp-bar button{font:inherit;cursor:pointer;border:0;border-radius:8px;}",
      ".yue-jp-bar button{background:#3a2e22;color:#f6e9c8;padding:6px 10px;}",
      ".yue-jp-bar button.icon{display:inline-flex;align-items:center;justify-content:center;",
      "width:32px;height:32px;padding:0;}",
      ".yue-jp-bar button.icon svg{width:15px;height:15px;display:block;fill:currentColor;}",
      ".yue-jp-bar button.on{box-shadow:inset 0 0 0 2px #e85a25;}",
      ".yue-jp-bar button[hidden]{display:none;}",
      ".yue-jp-bar button.primary{background:#e85a25;color:#fff;}",
      ".yue-jp-diagram{display:inline-flex;align-items:center;gap:6px;font-size:13px;}",
      ".yue-jp-diagram select{font:inherit;border:0;border-radius:8px;background:#3a2e22;",
      "color:#f6e9c8;padding:6px 8px;cursor:pointer;}",
      ".yue-jp-meta{opacity:.8;font-size:13px;margin-right:auto;}",
      ".yue-jp-tools{display:flex;flex-wrap:wrap;gap:8px 0;align-items:center;",
      "padding:8px 6px 10px;background:#241910;color:#f6e9c8;border-top:1px solid rgba(246,233,200,.14);}",
      ".yue-jp-tools[hidden]{display:none;}",
      ".yue-jp-group{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:0 8px;}",
      ".yue-jp-group + .yue-jp-group{border-left:1px solid rgba(246,233,200,.22);}",
      ".yue-jp-tools button{font:inherit;cursor:pointer;border:0;border-radius:8px;",
      "background:#3a2e22;color:#f6e9c8;padding:4px 8px;min-width:28px;}",
      ".yue-jp-tools button.digit{font-weight:700;min-width:32px;}",
      ".yue-jp-tools button.on{box-shadow:inset 0 0 0 2px #e03131;color:#fff;}",
      ".yue-jp-status{min-height:1.4em;padding:8px 14px;color:#8a5a20;font-size:13px;}",
      ".yue-jp-body{display:flex;flex:1;min-height:0;min-width:0;}",
      ".yue-jp-paper{position:relative;overflow:auto;padding:8px 16px 16px;flex:1;min-width:0;min-height:0;}",
      ".yue-jp-text{flex:0 0 420px;width:420px;min-width:0;min-height:0;",
      "display:flex;flex-direction:column;gap:4px;padding:0 12px 12px;",
      "box-sizing:border-box;}",
      ".yue-jp-split{flex:0 0 8px;width:8px;margin:0;padding:0;border:0;cursor:col-resize;",
      "touch-action:none;background:transparent;position:relative;}",
      ".yue-jp-split::before{content:\"\";position:absolute;top:8px;bottom:8px;left:3px;width:2px;",
      "background:#e0d0b0;border-radius:1px;}",
      ".yue-jp-split:hover::before,.yue-jp-split:focus::before,.yue-jp-split:focus-visible::before,",
      ".yue-jp-split.dragging::before{background:#e85a25;}",
      ".yue-jp-split:focus{outline:none;}",
      ".yue-jp-editor.yue-jp-dragging,.yue-jp-editor.yue-jp-dragging *{cursor:col-resize;user-select:none;}",
      ".yue-jp-text label{font-size:13px;font-weight:650;}",
      ".yue-jp-check{margin:0;min-height:1.3em;font-size:12px;line-height:1.4;color:#8a5a20;}",
      ".yue-jp-check.ok{color:#2b6b3a;}",
      ".yue-jp-check.bad{color:#c22525;}",
      ".yue-jp-text-frame{position:relative;flex:1;min-width:0;min-height:0;}",
      ".yue-jp-text textarea{box-sizing:border-box;margin:0;width:100%;height:100%;resize:none;",
      "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;",
      "padding:8px;border:1px solid #e0d0b0;border-radius:8px;",
      "white-space:pre-wrap;overflow-wrap:break-word;word-wrap:break-word;",
      "color:#2a1f12;background:#fffaf0;}",
      ".yue-jp-text textarea::selection{background:rgba(224,49,49,.28);color:#2a1f12;}",
      ".yue-jp-text textarea:focus{outline:2px solid #e85a25;border-color:transparent;}",
      ".yue-jp-hint{margin:0;font-size:12px;line-height:1.4;color:#8a5a20;}",
      ".yue-jp-paper svg{max-width:100%;height:auto;user-select:none;-webkit-user-select:none;}",
      ".yue-jp-paper svg path,.yue-jp-paper svg line{pointer-events:none;}",
      ".yue-sel-box{fill:rgba(224,49,49,.16);stroke:#e03131;pointer-events:none;}",
      "text[data-lyric].yue-sel{fill:#c22525;}",
      "text.fj.yue-sel{fill:#c22525;}",
      "text.fj.yue-jp-mismatch{fill:#d9480f;}",
      "text.fj.yue-play{fill:#0b7285;}",
      "line.yue-playhead{stroke:#e03131;stroke-width:2;pointer-events:none;}",
    ].join("");
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.className = "yue-jp-editor";
    root.hidden = true;
    root.innerHTML = [
      '<div class="yue-jp-card" tabindex="-1">',
      '<div class="yue-jp-bar">',
      "<h2>编辑简谱</h2>",
      '<span class="yue-jp-meta"></span>',
      '<label class="yue-jp-diagram">和弦图 ',
      '<select data-act="diagram" aria-label="和弦图">',
      '<option value="off">不显示</option>',
      '<option value="guitar">吉他</option>',
      '<option value="ukulele">尤克里里</option>',
      "</select></label>",
      '<button type="button" data-act="mode" data-mode="midi" hidden>MIDI</button>',
      '<button type="button" data-act="mode" data-mode="source" hidden>原声</button>',
      '<button type="button" class="icon" data-act="play" aria-label="播放" title="播放">' + PLAY_ICON + "</button>",
      '<button type="button" class="icon" data-act="stop" aria-label="停止" title="停止">' + STOP_ICON + "</button>",
      '<span class="yue-jp-clock">0:00</span>',
      '<button type="button" data-act="save">保存</button>',
      '<button type="button" data-act="ok" class="primary">完成</button>',
      '<button type="button" data-act="cancel">取消</button>',
      "</div>",
      '<div class="yue-jp-tools" hidden></div>',
      '<div class="yue-jp-status"></div>',
      '<div class="yue-jp-body">',
      '<div class="yue-jp-text">',
      '<label for="yue-jp-score-text">文本谱</label>',
      '<p class="yue-jp-check"></p>',
      '<div class="yue-jp-text-frame">',
      '<textarea id="yue-jp-score-text" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="soft" aria-label="文本谱"></textarea>',
      "</div>",
      '<p class="yue-jp-hint"></p>',
      "</div>",
      '<div class="yue-jp-split" role="separator" aria-orientation="vertical"',
      ' aria-label="调整文本谱宽度" aria-valuemin="220" aria-valuemax="420" aria-valuenow="420" tabindex="0"></div>',
      '<div class="yue-jp-paper"></div>',
      "</div>",
      "</div>",
    ].join("");
    document.body.appendChild(root);
    ui.root = root;
    ui.card = root.querySelector(".yue-jp-card");
    ui.meta = root.querySelector(".yue-jp-meta");
    ui.status = root.querySelector(".yue-jp-status");
    ui.body = root.querySelector(".yue-jp-body");
    ui.textPane = root.querySelector(".yue-jp-text");
    ui.split = root.querySelector(".yue-jp-split");
    ui.paper = root.querySelector(".yue-jp-paper");
    ui.clock = root.querySelector(".yue-jp-clock");
    ui.tools = root.querySelector(".yue-jp-tools");
    ui.text = root.querySelector("#yue-jp-score-text");
    ui.check = root.querySelector(".yue-jp-check");
    ui.hint = root.querySelector(".yue-jp-hint");
    ui.diagram = root.querySelector("[data-act='diagram']");
    ui.hint.textContent = "1 一拍 · 1/ 半拍 · 1// 十六分 · - 延长一拍 · 1' 高八度 · 1, 低八度 · #b 升降 · 0 休止 · ~ 连音";
    if (ui.diagram) {
      ui.diagram.value = readSavedDiagram();
      ui.diagram.addEventListener("change", () => {
        writeSavedDiagram(ui.diagram.value);
        ensureJianpu().then(() => renderScore());
      });
    }
    fillTools(ui.tools);
    ui.text.addEventListener("input", () => {
      if (ui.textSilent) return;
      ui.textDirty = true;
      clearSavedNote();
      if (ui.textTimer) clearTimeout(ui.textTimer);
      ui.textTimer = setTimeout(applyText, 120);
    });
    ui.text.addEventListener("keyup", () => {
      syncCaret();
    });
    ui.text.addEventListener("click", () => {
      syncCaret();
    });
    ui.text.addEventListener("select", () => {
      syncCaret();
    });
    ui.text.addEventListener("mouseup", () => {
      syncCaret();
    });
    root.addEventListener("click", (ev) => {
      if (ev.target === root) finish(null);
    });
    ui.card.addEventListener("mousedown", (ev) => {
      const button = ev.target.closest && ev.target.closest("button");
      if (!button) return;
      if (button.closest(".yue-jp-tools") || button.getAttribute("data-act") === "ok"
          || button.getAttribute("data-act") === "save") {
        ev.preventDefault();
      }
    });
    ui.card.addEventListener("click", (ev) => {
      const button = ev.target.closest && ev.target.closest("button");
      const act = button && button.getAttribute("data-act");
      if (act === "mode") setTransport(button.getAttribute("data-mode"));
      else if (act === "play") togglePlay();
      else if (act === "stop") stopPlayback();
      else if (act === "save") saveEdit();
      else if (act === "ok") acceptText();
      else if (act === "cancel") finish(null);
      else if (button && ui.tools.contains(button)) {
        const command = commandFrom(button);
        if (!command) return;
        run(command);
      }
    });
    ui.paper.addEventListener("pointerdown", (ev) => {
      ui.pointerPicked = false;
      if (ev.button != null && ev.button !== 0) return;
      const picked = headAt(ev.target, ev.clientX, ev.clientY);
      if (!picked) return;
      ev.preventDefault();
      ui.pointerPicked = true;
      applyPicked(picked);
    });
    ui.paper.addEventListener("click", (ev) => {
      if (ui.pointerPicked) {
        ui.pointerPicked = false;
        return;
      }
      const picked = headAt(ev.target, ev.clientX, ev.clientY);
      if (!picked) return;
      applyPicked(picked);
    });
    document.addEventListener("keydown", (event) => {
    if (!ui.root || ui.root.hidden) return;
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "s") {
      event.preventDefault();
      saveEdit();
      return;
    }
    if (ui.text && event.target === ui.text) return;
    if (ui.split && event.target === ui.split) return;
      onKey(event);
    });
    bindSplitter();
  }

  function formatClock(seconds) {
    const safe = Math.max(0, seconds || 0);
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function setStatus(text) {
    if (ui.status) ui.status.textContent = text || "";
  }

  function clearSavedNote() {
    if (!ui.savedNote) return;
    ui.savedNote = false;
    if (ui.status && ui.status.textContent === "已保存") setStatus("");
  }

  function stopSaveWatch() {
    if (ui.saveObserver) {
      ui.saveObserver.disconnect();
      ui.saveObserver = null;
    }
    if (ui.savePoll) {
      clearInterval(ui.savePoll);
      ui.savePoll = 0;
    }
    if (ui.saveWatch) {
      clearTimeout(ui.saveWatch);
      ui.saveWatch = 0;
    }
  }

  function saveNoteText() {
    const box = ui.saveNote;
    if (!box) return "";
    const field = box.querySelector("textarea") || box.querySelector("input");
    if (field) return String(field.value || "").trim();
    return String(box.textContent || "").trim();
  }

  function watchSaveNote() {
    const before = saveNoteText();
    stopSaveWatch();
    const done = (text) => {
      stopSaveWatch();
      if (!text) return;
      ui.savedNote = true;
      setStatus(text);
    };
    if (ui.saveNote && typeof MutationObserver !== "undefined") {
      ui.saveObserver = new MutationObserver(() => {
        const text = saveNoteText();
        if (text && text !== before) done(text);
      });
      ui.saveObserver.observe(ui.saveNote, {
        subtree: true, childList: true, characterData: true, attributes: true,
      });
    }
    ui.savePoll = setInterval(() => {
      const text = saveNoteText();
      if (text && text !== before) done(text);
    }, 150);
    ui.saveWatch = setTimeout(() => done(""), 20000);
  }

  function fillTools(root) {
    const groups = [
      ["1", "2", "3", "4", "5", "6", "7", "0"].map((digit) => ({
        label: digit,
        title: digit === "0" ? "休止（0）" : "唱名 " + digit,
        className: "digit",
        attrs: { act: "degree", degree: digit },
      })),
      [
        { label: "↑", title: "升高八度", attrs: { act: "octave", delta: "1" } },
        { label: "↓", title: "降低八度", attrs: { act: "octave", delta: "-1" } },
        { label: "♯", title: "升号（#）", attrs: { act: "accidental", kind: "sharp" } },
        { label: "♭", title: "降号（b）", attrs: { act: "accidental", kind: "flat" } },
        { label: "♮", title: "还原号（n）", attrs: { act: "accidental", kind: "natural" } },
      ],
      [
        { label: "½", title: "时值减半", attrs: { act: "duration", factor: "0.5" } },
        { label: "×2", title: "时值加倍", attrs: { act: "duration", factor: "2" } },
        { label: "附点", title: "附点", attrs: { act: "duration", factor: "1.5" } },
        { label: "延长", title: "延长音节：从后面的休止让出一拍", attrs: { act: "sustain" } },
      ],
      [
        { label: "连音", title: "连音符：接到后面同样的音，再按一次取消", attrs: { act: "tie" } },
        { label: "插入", title: "在这个音后面插入", attrs: { act: "insert" } },
        { label: "删除", title: "删除这个音", attrs: { act: "delete" } },
      ],
    ];
    groups.forEach((specs) => {
      const group = document.createElement("div");
      group.className = "yue-jp-group";
      specs.forEach((spec) => {
        const button = document.createElement("button");
        button.type = "button";
        if (spec.className) button.className = spec.className;
        button.textContent = spec.label;
        button.title = spec.title;
        Object.keys(spec.attrs).forEach((key) => button.setAttribute("data-" + key, spec.attrs[key]));
        group.appendChild(button);
      });
      root.appendChild(group);
    });
  }

  function commandFrom(button) {
    const act = button.getAttribute("data-act");
    if (act === "degree") return { op: "degree", degree: Number(button.getAttribute("data-degree")) };
    if (act === "octave") return { op: "octave", delta: Number(button.getAttribute("data-delta")) };
    if (act === "accidental") return { op: "accidental", kind: button.getAttribute("data-kind") };
    if (act === "duration") return { op: "duration", factor: Number(button.getAttribute("data-factor")) };
    if (act === "tie" || act === "sustain" || act === "insert" || act === "delete") return { op: act };
    return null;
  }

  function digitNodes(list) {
    return [...list].filter((el) => /^[0-7]$/.test((el.textContent || "").trim()));
  }

  function heads() {
    if (!ui.paper) return [];
    const voiced = digitNodes(ui.paper.querySelectorAll("text.fj.v-Vocal, text.fj.v-Ins"));
    if (voiced.length) return voiced;
    return digitNodes(ui.paper.querySelectorAll("text.fj"));
  }

  function pickedHead(target) {
    const lyric = target && target.closest && target.closest("text[data-lyric]");
    if (lyric && lyric.dataset.idx != null && lyric.dataset.idx !== "") {
      const lyricIndex = Number(lyric.dataset.idx);
      if (Number.isInteger(lyricIndex)) {
        return { voice: "Vocal", index: lyricIndex, slice: 0 };
      }
    }
    const node = target && target.closest && target.closest("text.fj");
    if (!node || node.dataset.idx == null || node.dataset.idx === "") return null;
    const index = Number(node.dataset.idx);
    if (!Number.isInteger(index)) return null;
    return {
      voice: node.dataset.voice || "Vocal",
      index: index,
      slice: Number(node.dataset.slice || 0),
    };
  }

  // The digit's ink is only a few pixels wide. A press on the box beside it,
  // or on the octave dot or accidental, still belongs to that note.
  function nearestHead(x, y, heads) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let best = null;
    let bestD = Infinity;
    for (const head of heads || []) {
      if (!head) continue;
      const left = Number(head.x);
      const top = Number(head.y);
      const w = Number(head.w) || 0;
      const h = Number(head.h) || 0;
      if (!Number.isFinite(left) || !Number.isFinite(top) || !(w || h)) continue;
      const padX = w || h;
      const padY = (h || w) * 0.5;
      if (x < left - padX || x > left + w + padX || y < top - padY || y > top + h + padY) continue;
      const dx = x - (left + w / 2);
      const dy = y - (top + h / 2);
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        best = head;
        bestD = d;
      }
    }
    return best;
  }

  function headBox(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    if (!(rect.width || rect.height)) return null;
    const index = Number(el.dataset.idx);
    if (!Number.isInteger(index)) return null;
    return {
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
      voice: el.dataset.voice || "Vocal",
      index: index,
      slice: Number(el.dataset.slice || 0),
    };
  }

  function headAt(target, x, y) {
    const direct = pickedHead(target);
    if (direct) return direct;
    const boxes = [];
    for (const el of heads()) {
      const box = headBox(el);
      if (box) boxes.push(box);
    }
    const found = nearestHead(x, y, boxes);
    if (!found) return null;
    return { voice: found.voice, index: found.index, slice: found.slice || 0 };
  }

  function applyPicked(picked) {
    if (!picked) return;
    selectNote(picked.voice, picked.index, picked.slice);
    if (ui.transport === "source") seekSource(picked);
  }

  function sameHead(el) {
    if (ui.index < 0) return false;
    return (el.dataset.voice || "Vocal") === (ui.voice || "Vocal")
      && Number(el.dataset.idx) === ui.index
      && Number(el.dataset.slice || 0) === (ui.slice || 0);
  }

  function boxInSvg(el) {
    const svg = el.ownerSVGElement;
    if (!svg || !el.getBBox) return null;
    let bb;
    try { bb = el.getBBox(); } catch (err) { return null; }
    if (!(bb.width || bb.height)) return null;
    const screen = el.getScreenCTM && el.getScreenCTM();
    const root = svg.getScreenCTM && svg.getScreenCTM();
    if (!screen || !root || !root.inverse) {
      return { svg: svg, x: bb.x, y: bb.y, w: bb.width, h: bb.height };
    }
    const m = root.inverse().multiply(screen);
    const pts = [
      new DOMPoint(bb.x, bb.y),
      new DOMPoint(bb.x + bb.width, bb.y),
      new DOMPoint(bb.x, bb.y + bb.height),
      new DOMPoint(bb.x + bb.width, bb.y + bb.height),
    ].map((p) => p.matrixTransform(m));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min.apply(null, xs);
    const y = Math.min.apply(null, ys);
    return {
      svg: svg,
      x: x,
      y: y,
      w: Math.max.apply(null, xs) - x,
      h: Math.max.apply(null, ys) - y,
    };
  }

  function drawSelectionBox(node) {
    if (!node) return;
    const box = boxInSvg(node);
    if (!box) return;
    const pad = Math.max(3, box.h * 0.22);
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("class", "yue-sel-box");
    rect.setAttribute("x", String(box.x - pad));
    rect.setAttribute("y", String(box.y - pad));
    rect.setAttribute("width", String(Math.max(1, box.w + pad * 2)));
    rect.setAttribute("height", String(Math.max(1, box.h + pad * 2)));
    rect.setAttribute("rx", String(Math.max(2, pad * 0.45)));
    rect.setAttribute("fill", "rgba(224,49,49,0.16)");
    rect.setAttribute("stroke", "#e03131");
    rect.setAttribute("stroke-width", String(Math.max(1.6, box.h * 0.08)));
    rect.setAttribute("pointer-events", "none");
    box.svg.appendChild(rect);
  }

  function syncTools() {
    if (!ui.tools) return;
    const ev = ui.index >= 0 ? eventsFor(ui.abc, ui.voice)[ui.index] : null;
    ui.tools.hidden = !ev;
    if (!ev) return;
    ui.tools.querySelectorAll("[data-degree]").forEach((btn) => {
      const on = ev.digit === btn.getAttribute("data-degree");
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    ui.tools.querySelectorAll("[data-kind]").forEach((btn) => {
      const on = ev.accidental === btn.getAttribute("data-kind");
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const tie = ui.tools.querySelector("[data-act='tie']");
    if (tie) {
      tie.classList.toggle("on", !!ev.tie);
      tie.setAttribute("aria-pressed", ev.tie ? "true" : "false");
    }
  }

  function selectNote(voice, index, slice) {
    ui.voice = voice || "Vocal";
    ui.index = index;
    ui.slice = slice || 0;
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
      applyText();
    }
    setStatus("");
    markSelection(true);
  }

  function markSelection(locate) {
    ui.lyricSelection = null;
    const nodes = heads();
    if (ui.paper) ui.paper.querySelectorAll(".yue-sel-box").forEach((el) => el.remove());
    nodes.forEach((el) => {
      const on = sameHead(el);
      el.classList.toggle("yue-sel", on);
      if (on) drawSelectionBox(el);
    });
    if (ui.paper) {
      ui.paper.querySelectorAll("text[data-lyric]").forEach((el) => {
        const on = (ui.voice || "Vocal") !== "Ins" && Number(el.dataset.idx) === ui.index;
        el.classList.toggle("yue-sel", on);
      });
    }
    reveal(nodes.find(sameHead));
    syncTools();
    showTextMark(locate === true);
  }

  function markLyricSelection(indexes) {
    const picked = (indexes || []).filter((index) => Number.isInteger(index));
    ui.lyricSelection = picked.slice();
    if (!picked.length) {
      markSelection();
      return;
    }
    ui.voice = "Vocal";
    ui.index = picked[0];
    ui.slice = 0;
    const want = new Set(picked);
    if (ui.paper) ui.paper.querySelectorAll(".yue-sel-box").forEach((el) => el.remove());
    const covered = new Set();
    let first = null;
    if (ui.paper) {
      ui.paper.querySelectorAll("text[data-lyric]").forEach((el) => {
        const index = Number(el.dataset.idx);
        const on = want.has(index);
        el.classList.toggle("yue-sel", on);
        if (!on) return;
        covered.add(index);
        if (index === picked[0]) first = el;
      });
    }
    let fallback = null;
    heads().forEach((el) => {
      const voice = el.dataset.voice || "Vocal";
      const index = Number(el.dataset.idx);
      const on = voice === "Vocal"
        && want.has(index)
        && !covered.has(index)
        && Number(el.dataset.slice || 0) === 0;
      el.classList.toggle("yue-sel", on);
      if (on && index === picked[0]) fallback = el;
    });
    syncTools();
    reveal(first || fallback);
  }

  function reveal(node) {
    const host = ui.paper;
    if (!host || !node || !node.getBoundingClientRect) return;
    const box = node.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    if (box.top < frame.top + 4) host.scrollTop -= frame.top + 4 - box.top;
    else if (box.bottom > frame.bottom - 4) host.scrollTop += box.bottom - (frame.bottom - 4);
  }

  function headFor(mark) {
    if (!mark) return null;
    return heads().find((el) =>
      (el.dataset.voice || "Vocal") === mark.voice
      && Number(el.dataset.idx) === mark.index
      && Number(el.dataset.slice || 0) === mark.slice
    ) || null;
  }

  function systemSpan(svg) {
    const parts = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[3] > 0) {
      return { y: parts[1], h: parts[3] };
    }
    try {
      const bb = svg.getBBox();
      return { y: bb.y, h: bb.height || 40 };
    } catch (err) {
      return { y: 0, h: 40 };
    }
  }

  function clearPlayhead() {
    if (ui.playhead) ui.playhead.remove();
    ui.playhead = null;
    ui.playKey = "";
  }

  function drawPlayhead(node) {
    const box = boxInSvg(node);
    if (!box) return;
    const span = systemSpan(box.svg);
    const x = Math.max(0.8, box.x - Math.max(1.5, box.w * 0.2));
    let line = ui.playhead;
    if (!line || line.ownerSVGElement !== box.svg) {
      if (line) line.remove();
      line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "yue-playhead");
      line.setAttribute("stroke", "#e03131");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("pointer-events", "none");
      box.svg.appendChild(line);
      ui.playhead = line;
    }
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", String(span.y + 2));
    line.setAttribute("y2", String(span.y + Math.max(8, span.h - 2)));
  }

  // Viewport pixels. Null when the box center is already inside `slack` of
  // the frame center (default 1px), or the inputs cannot be placed. The top
  // of the scroll is 0; the far end is clamped by the browser on assignment.
  function centerScroll(scroll, frameStart, frameSize, boxStart, boxSize, slack) {
    const top = Number(scroll) || 0;
    const origin = Number(frameStart);
    const size = Number(frameSize);
    const start = Number(boxStart);
    const span = Number(boxSize);
    if (!Number.isFinite(origin) || !(size > 0) || !Number.isFinite(start) || !Number.isFinite(span)) {
      return null;
    }
    const band = Number.isFinite(Number(slack)) ? Math.max(0, Number(slack)) : 1;
    const delta = (start + span / 2) - (origin + size / 2);
    if (Math.abs(delta) <= band) return null;
    const next = Math.max(0, top + delta);
    if (Math.abs(next - top) < 1) return null;
    return next;
  }

  function nudgeAcross(host, box, frame) {
    if (box.right > frame.right - 16) {
      host.scrollLeft += box.right - (frame.right - 16);
    } else if (box.left < frame.left + 8) {
      host.scrollLeft -= frame.left + 8 - box.left;
    }
  }

  function followPlayhead(node) {
    const host = ui.paper;
    if (!host || !node || !node.getBoundingClientRect) return;
    const box = node.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    const margin = 48;
    if (box.bottom > frame.bottom - margin) {
      host.scrollTop += box.top - (frame.top + margin);
    } else if (box.top < frame.top + 8) {
      host.scrollTop -= frame.top + 8 - box.top;
    }
    nudgeAcross(host, box, frame);
  }

  function stopEaseScroll() {
    if (ui.scrollRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(ui.scrollRaf);
    ui.scrollRaf = 0;
    ui.scrollGoal = null;
  }

  function easeScroll(host, top) {
    const goal = Math.max(0, top);
    if (ui.scrollRaf && ui.scrollGoal != null && Math.abs(goal - ui.scrollGoal) < 12) return;
    ui.scrollGoal = goal;
    if (ui.scrollRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(ui.scrollRaf);
    ui.scrollRaf = 0;
    const from = host.scrollTop || 0;
    const delta = goal - from;
    if (Math.abs(delta) < 1) return;
    if (typeof requestAnimationFrame !== "function") {
      host.scrollTop = goal;
      return;
    }
    const nowMs = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const dur = Math.max(180, Math.min(480, 140 + Math.abs(delta) * 0.45));
    const step = (now) => {
      const t = Math.min(1, Math.max(0, ((now || 0) - nowMs) / dur));
      host.scrollTop = from + delta * (t * (2 - t));
      if (t < 1) ui.scrollRaf = requestAnimationFrame(step);
      else ui.scrollRaf = 0;
    };
    ui.scrollRaf = requestAnimationFrame(step);
  }

  function centerPlayhead(node) {
    const host = ui.paper;
    if (!host || !node || !node.getBoundingClientRect) return;
    const box = node.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    const slack = Math.max(28, frame.height * 0.08);
    const top = centerScroll(host.scrollTop, frame.top, frame.height, box.top, box.height, slack);
    if (top != null) easeScroll(host, top);
    nudgeAcross(host, box, frame);
  }

  const ABC2SVG_SRC = "/score/abc2svg/abc2svg-1.js";
  const JIANPU_SRC = "/score/abc2svg/jianpu-1.js";
  const DIAG_SRC = "/score/abc2svg/diag-1.js";

  function jianpuReady() {
    return typeof abc2svg !== "undefined" && !!abc2svg.Abc && !!abc2svg.jianpu;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(src));
      document.head.appendChild(el);
    });
  }

  let jianpuLoading = null;
  function diagReady() {
    return typeof abc2svg !== "undefined" && !!abc2svg.diag;
  }

  function ensureJianpu() {
    if (jianpuReady() && diagReady()) return Promise.resolve(true);
    if (jianpuLoading) return jianpuLoading;
    jianpuLoading = (async () => {
      if (typeof abc2svg === "undefined" || !abc2svg.Abc) {
        await loadScript(ABC2SVG_SRC);
      }
      if (typeof abc2svg === "undefined" || !abc2svg.jianpu) {
        await loadScript(JIANPU_SRC);
      }
      if (typeof abc2svg !== "undefined" && !abc2svg.diag) {
        try {
          await loadScript(DIAG_SRC);
        } catch (_err) {
          try {
            const res = await fetch(DIAG_SRC, { cache: "reload" });
            if (!res.ok) throw new Error(DIAG_SRC);
            const el = document.createElement("script");
            el.textContent = await res.text();
            document.head.appendChild(el);
          } catch (_err2) {
            /* Chord diagrams stay off if diag-1.js cannot load. */
          }
        }
      }
      return jianpuReady();
    })().finally(() => {
      jianpuLoading = null;
    });
    return jianpuLoading;
  }

  function fitDiagramSvg(svg) {
    return String(svg || "").replace(/<svg\b[\s\S]*?<\/svg>/g, (doc) => {
      if (doc.indexOf('class="diag"') < 0) return doc;
      const re = /<g(?: class="diag")? transform="translate\(([-\d.]+),([-\d.]+)\)"|<\/g>/g;
      let match;
      let ty = 0;
      const stack = [];
      const tops = [];
      while ((match = re.exec(doc))) {
        if (match[0] === "</g>") {
          ty = stack.length ? stack.pop() : 0;
          continue;
        }
        stack.push(ty);
        ty += Number(match[2]);
        if (match[0].indexOf("diag") >= 0) tops.push(ty - 34);
      }
      if (!tops.length) return doc;
      const minTop = Math.min.apply(null, tops);
      const pad = 6;
      if (minTop >= pad) return doc;
      const dy = pad - minTop;
      if (!/viewBox="0 0 [\d.]+ [\d.]+"/.test(doc) || !/height="[\d.]+px"/.test(doc))
        return doc;
      const opened = doc.replace(/<svg\b([^>]*)>/, (_, attrs) => {
        const next = attrs
          .replace(/viewBox="0 0 ([\d.]+) ([\d.]+)"/, (__, w, h) =>
            'viewBox="0 0 ' + w + " " + (Number(h) + dy).toFixed(0) + '"')
          .replace(/height="([\d.]+)px"/, (__, h) =>
            'height="' + (Number(h) + dy).toFixed(0) + 'px"');
        return '<svg' + next + '><g transform="translate(0,' + dy.toFixed(1) + ')">';
      });
      return opened.replace(/<\/svg>\s*$/, "</g></svg>");
    });
  }

  function renderJianpuSvg(abc, diagram) {
    const buf = [];
    const renderer = new abc2svg.Abc({
      img_out: (svg) => buf.push(svg),
      errbld: () => {},
      errmsg: () => {},
      read_file: () => "",
    });
    if (typeof abc2svg.diag !== "undefined" && abc2svg.diag.set_hooks)
      abc2svg.diag.set_hooks(renderer);
    renderer.tosvg("jianpu", previewAbc(abc, diagram));
    return fitDiagramSvg(buf.join(""));
  }

  function renderScore() {
    stopEaseScroll();
    ui.marks = playMarks(ui.abc);
    ui.playhead = null;
    ui.playKey = "";
    const info = inspectScore(ui.abc);
    ui.meta.textContent = info.error ? "" : info.keyLabel + "  ·  ♩=" + info.bpm;
    if (typeof abc2svg === "undefined" || !abc2svg.Abc || !abc2svg.jianpu) {
      ui.paper.innerHTML = "<p>简谱模块没有载入。</p>";
      ui.scoreSvg = "";
      clearMismatch();
      showCheck({ ok: false, message: "没法对谱" });
      return;
    }
    const diagram = currentDiagram();
    let svg = "";
    try {
      svg = renderJianpuSvg(ui.abc, diagram);
    } catch (err) {
      if (diagram !== DIAGRAM_OFF) {
        try {
          svg = renderJianpuSvg(ui.abc, DIAGRAM_OFF);
          setStatus("和弦图画不出来，先只显示简谱。");
        } catch (fallbackErr) {
          ui.paper.textContent = "简谱渲染失败";
          ui.scoreSvg = "";
          clearMismatch();
          showCheck({ ok: false, message: "没法对谱" });
          setStatus(String((fallbackErr && fallbackErr.message) || fallbackErr || err && err.message || err));
          return;
        }
      } else {
        ui.paper.textContent = "简谱渲染失败";
        ui.scoreSvg = "";
        clearMismatch();
        showCheck({ ok: false, message: "没法对谱" });
        setStatus(String((err && err.message) || err));
        return;
      }
    }
    ui.scoreSvg = svg;
    ui.paper.innerHTML = svg || "<p>简谱是空的。</p>";
    if (diagram !== DIAGRAM_OFF && svg.indexOf('class="diag"') < 0 && /"[A-G]/.test(ui.abc)) {
      if (!diagReady()) setStatus("和弦图模块没有载入。");
    }
    const vocalOk = stampVoice("Vocal");
    const insOk = stampVoice("Ins");
    stampLyrics();
    if (!vocalOk) setStatus("简谱上的音和人声对不上。");
    else if (!insOk) setStatus("伴奏谱上的音对不上。");
    if (ui.index >= 0) {
      const pool = eventsFor(ui.abc, ui.voice);
      if (ui.index >= pool.length) {
        ui.index = pool.length ? pool.length - 1 : -1;
        ui.slice = 0;
      }
    }
    markSelection();
    if (ui.transport === "source" && ui.audio && ui.audioUrl && (ui.sourceTouched || !ui.audio.paused)) {
      paintPlayhead(ui.audio.currentTime || 0);
    }
    refreshNoteCheck();
  }

  function stampVoice(voice) {
    const nodes = digitNodes(ui.paper.querySelectorAll("text.fj.v-" + voice));
    if (!nodes.length) return true;
    const indexes = headIndexes(ui.abc, voice);
    if (indexes.length !== nodes.length) return false;
    const seen = new Map();
    nodes.forEach((el, i) => {
      const index = indexes[i];
      const slice = seen.has(index) ? seen.get(index) : 0;
      seen.set(index, slice + 1);
      el.dataset.voice = voice;
      el.dataset.idx = String(index);
      el.dataset.slice = String(slice);
    });
    return true;
  }

  function stampLyrics() {
    if (!ui.paper || !ui.paper.querySelectorAll) return;
    const vocal = heads().filter((el) => el.dataset.voice === "Vocal");
    const events = eventsFor(ui.abc, "Vocal");
    const drawn = {};
    events.forEach((ev) => {
      if (lyricIsDrawn(ev.lyric)) drawn[ev.index] = true;
    });
    const headBoxes = [];
    vocal.forEach((el) => {
      if (!el.getBoundingClientRect) return;
      const box = el.getBoundingClientRect();
      if (!(box.width || box.height)) return;
      headBoxes.push({
        x: (box.left + box.right) / 2,
        y: (box.top + box.bottom) / 2,
        h: box.height,
        index: Number(el.dataset.idx),
        voice: "Vocal",
      });
    });
    const glyphs = [];
    ui.paper.querySelectorAll("text").forEach((el) => {
      if (el.classList.contains("fj") || el.classList.contains("jacc")) return;
      const cls = el.getAttribute("class") || "";
      if (!/(?:^|\s)f\d+/.test(cls)) return;
      const text = (el.textContent || "").replace(/\s+/g, "");
      if (!text || text === "唱" || text === "伴" || text.indexOf("=") >= 0) return;
      if (!el.getBoundingClientRect) return;
      const box = el.getBoundingClientRect();
      if (!(box.width || box.height)) return;
      glyphs.push({
        el: el,
        x: (box.left + box.right) / 2,
        y: (box.top + box.bottom) / 2,
      });
    });
    const heights = headBoxes.map((head) => head.h).filter((h) => h > 0).sort((a, b) => a - b);
    const noteH = heights.length ? heights[(heights.length / 2) | 0] : 16;
    const maxGap = Math.max(48, noteH * 4);
    const hits = assignLyricHits(headBoxes, glyphs, drawn, {
      rowSlack: Math.max(4, noteH * 0.6),
      maxGap: maxGap,
    });
    const hitIndexes = new Set();
    const claim = (hit) => {
      if (hitIndexes.has(hit.index)) return;
      hitIndexes.add(hit.index);
      const el = hit.glyph && hit.glyph.el;
      if (!el) return;
      el.dataset.lyric = "1";
      el.dataset.voice = "Vocal";
      el.dataset.idx = String(hit.index);
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", "歌词 " + (el.textContent || "").replace(/\s+/g, ""));
    };
    hits.forEach(claim);
    const claimedGlyph = new Set(hits.map((hit) => hit.glyph));
    const xs = headBoxes.map((head) => head.x).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    let neighbor = 36;
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i] - xs[i - 1];
      if (gap > 4 && gap < neighbor) neighbor = gap;
    }
    glyphsUnderNotes(headBoxes.filter((head) => !hitIndexes.has(head.index)), glyphs.filter((glyph) => !claimedGlyph.has(glyph)), {
      maxGap: maxGap,
      xSlack: Math.max(16, neighbor * 0.65),
    }).forEach(claim);
  }

  function refreshTextFromAbc() {
    if (!ui.text) return;
    const built = buildJianpuText(ui.abc);
    ui.textSilent = true;
    ui.text.value = built.text || "";
    ui.textSilent = false;
    ui.textDirty = false;
    ui.textBlocked = false;
    ui.textError = "";
    ui.textMarks = built.marks || [];
    if (built.error) setStatus(built.error);
    showTextMark(true);
  }

  function clearMismatch() {
    if (!ui.paper) return;
    ui.paper.querySelectorAll(".yue-jp-mismatch").forEach((el) => {
      el.classList.remove("yue-jp-mismatch");
    });
  }

  function showCheck(result) {
    if (!ui.check || !result) return;
    ui.check.textContent = result.message || "";
    ui.check.classList.toggle("ok", !!result.ok);
    ui.check.classList.toggle("bad", !result.ok);
  }

  function markMismatches(marks) {
    clearMismatch();
    if (!ui.paper || !marks || !marks.length) return;
    ["Vocal", "Ins"].forEach((voice) => {
      const nodes = digitNodes(ui.paper.querySelectorAll("text.fj.v-" + voice));
      marks.forEach((mark) => {
        if (mark.voice !== voice) return;
        const el = nodes[mark.glyph];
        if (el) el.classList.add("yue-jp-mismatch");
      });
    });
  }

  function refreshNoteCheck() {
    if (!ui.check || !ui.text) return;
    if (ui.textBlocked) {
      clearMismatch();
      showCheck({ ok: false, message: "文本还读不懂，没法对谱" });
      return;
    }
    const svg = ui.scoreSvg || "";
    if (!/<text\b[^>]*\bfj\b/.test(svg)) {
      if (!svg) return;
      clearMismatch();
      showCheck({ ok: false, message: "没法对谱" });
      return;
    }
    const header = parseHeader(String(ui.abc || "").split(/\r?\n/));
    const result = compareJianpuNotes(
      ui.text.value,
      svg,
      quarterUnits(header.lDen),
      header.lDen,
      perBarUnits(header.meter, header.lDen),
    );
    if (result.unreadable) clearMismatch();
    else markMismatches(result.marks);
    showCheck(result);
  }

  function applyText() {
    ui.textTimer = 0;
    if (!ui.text) return;
    const parsed = parseJianpuText(ui.text.value, ui.sourceAbc || ui.abc);
    if (!parsed.abc) {
      ui.textBlocked = true;
      ui.textError = parsed.error || "读不懂这行";
      ui.textMarks = [];
      setStatus(ui.textError);
      refreshNoteCheck();
      if (ui.lyricSelection) markSelection();
      showTextMark();
      return;
    }
    ui.textBlocked = false;
    ui.textError = "";
    ui.textMarks = parsed.marks || [];
    const changed = parsed.abc !== ui.abc;
    ui.abc = parsed.abc;
    if (changed) {
      stopPlayback();
      renderScore();
    } else refreshNoteCheck();
    if (parsed.warning || parsed.note) setStatus(parsed.warning || parsed.note);
    else if (!ui.status || !/对不上|失败|没有载入/.test(ui.status.textContent || "")) setStatus("");
    if (document.activeElement === ui.text) syncCaret();
    showTextMark();
  }

  function showTextMark(locate) {
    if (!ui.text) return;
    const editing = typeof document !== "undefined" && document.activeElement === ui.text;
    if (!locate && editing) return;
    if (ui.textBlocked || ui.index < 0) return;
    const span = textSpanFor(ui.text.value, ui.textMarks, ui.voice || "Vocal", ui.index, ui.slice || 0);
    if (!span) return;
    const box = locate ? textSpanBox(ui.text, span.start, span.end) : null;
    const before = ui.text.scrollTop;
    try {
      if (document.activeElement !== ui.text && ui.text.focus) {
        ui.text.focus({ preventScroll: true });
      }
      ui.text.setSelectionRange(span.start, span.start);
      ui.text.setSelectionRange(span.start, span.end);
    } catch (_err) {
      /* the textarea can be detached while the editor is closing */
    }
    if (!locate || !box) return;
    const next = textScrollTarget(
      before, ui.text.clientHeight, box.top, box.bottom, TEXT_SCROLL_MARGIN);
    ui.text.scrollTop = next == null ? before : next;
  }

  function syncCaret() {
    if (!ui.text || ui.textBlocked || !ui.textMarks.length) {
      if (ui.lyricSelection) markSelection();
      return;
    }
    const start = ui.text.selectionStart || 0;
    const end = ui.text.selectionEnd == null ? start : ui.text.selectionEnd;
    const lyrics = lyricIndexesInSelection(ui.textMarks, start, end);
    if (lyrics.length) {
      markLyricSelection(lyrics);
      return;
    }
    const hadLyrics = !!ui.lyricSelection;
    let found = null;
    for (const mark of ui.textMarks) {
      if (!mark || mark.kind === "lyric") continue;
      if (start >= mark.start && start <= mark.end) {
        found = mark;
        break;
      }
    }
    if (!found) {
      if (hadLyrics) markSelection();
      return;
    }
    if (found.voice === ui.voice && found.index === ui.index && !ui.slice) {
      if (hadLyrics) markSelection();
      return;
    }
    ui.voice = found.voice;
    ui.index = found.index;
    ui.slice = 0;
    markSelection();
  }

  function pendingAbc() {
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
      applyText();
    }
    if (ui.textDirty && ui.text) {
      const parsed = parseJianpuText(ui.text.value, ui.sourceAbc || ui.abc);
      if (!parsed.abc || parsed.error || parsed.warning) {
        if (!parsed.abc) {
          ui.textBlocked = true;
          ui.textError = parsed.error || "文本谱还不能写回";
        }
        setStatus(parsed.error || parsed.warning || "文本谱还不能写回");
        return null;
      }
      ui.abc = parsed.abc;
      ui.textDirty = false;
    }
    return ui.abc;
  }

  function acceptText() {
    const abc = pendingAbc();
    if (abc == null) return;
    finish(abc);
  }

  function saveEdit() {
    const abc = pendingAbc();
    if (abc == null) return;
    const host = ui.saveButton;
    const target = host && (host.querySelector("button") || host);
    if (!target || !target.click) {
      setStatus("这一页不能保存简谱");
      return;
    }
    watchSaveNote();
    target.click();
  }

  function currentAbc() {
    return ui.abc || "";
  }

  function run(command) {
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
      applyText();
    }
    if (ui.textBlocked) {
      setStatus(ui.textError || "先改好文本谱里读不懂的记号");
      return false;
    }
    clearSavedNote();
    stopPlayback();
    if (ui.index < 0) {
      setStatus("先点一个音符");
      return false;
    }
    const next = editScore(ui.abc, Object.assign({
      index: ui.index,
      voice: ui.voice || "Vocal",
      slice: ui.slice || 0,
    }, command));
    if (next.error) {
      setStatus(next.error);
      return false;
    }
    ui.abc = next.abc;
    if (command.index == null) {
      if (next.index != null) ui.index = next.index;
      ui.slice = 0;
    }
    if (next.leftover) setStatus("还有 " + next.leftover + " 个字没有音符");
    else setStatus("");
    refreshTextFromAbc();
    renderScore();
    if (next.leftover && ui.status && !ui.status.textContent) {
      setStatus("还有 " + next.leftover + " 个字没有音符");
    }
    if (command.op === "degree" || command.op === "octave" || command.op === "accidental") {
      playMidi(noteMidi(ui.abc, ui.index, ui.voice));
    }
    return true;
  }

  function onKey(event) {
    if (event.isComposing || event.keyCode === 229) return;
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      const nodes = heads();
      if (!nodes.length) return;
      const step = key === "ArrowLeft" ? -1 : 1;
      let pos = nodes.findIndex(sameHead);
      if (pos < 0) pos = step < 0 ? nodes.length - 1 : 0;
      else pos = Math.max(0, Math.min(nodes.length - 1, pos + step));
      const node = nodes[pos];
      selectNote(node.dataset.voice || "Vocal", Number(node.dataset.idx), Number(node.dataset.slice || 0));
      return;
    }
    const command = commandOfKey(key);
    if (!command) return;
    event.preventDefault();
    run(command);
  }

  function commandOfKey(key) {
    if (/^[0-7]$/.test(key)) return { op: "degree", degree: Number(key) };
    if (key === "ArrowUp") return { op: "octave", delta: 1 };
    if (key === "ArrowDown") return { op: "octave", delta: -1 };
    if (key === "#") return { op: "accidental", kind: "sharp" };
    if (key === "b") return { op: "accidental", kind: "flat" };
    if (key === "n") return { op: "accidental", kind: "natural" };
    if (key === "_") return { op: "duration", factor: 0.5 };
    if (key === "=") return { op: "duration", factor: 2 };
    if (key === ".") return { op: "duration", factor: 1.5 };
    if (key === "-") return { op: "sustain" };
    if (key === "t") return { op: "tie" };
    if (key === "Delete" || key === "Backspace") return { op: "delete" };
    if (key === "+") return { op: "insert" };
    return null;
  }

  function playMidi(midi) {
    if (typeof window === "undefined" || midi == null) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !window.yuePiano) return;
    ui.ctx = ui.ctx || new AudioCtx();
    const ctx = ui.ctx;
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    const known = window.yuePiano.voice && window.yuePiano.voice(ctx);
    const previous = ui.status ? ui.status.textContent : "";
    if (!known) setStatus("正在加载钢琴音色");
    const loading = window.yuePiano.prepare ? window.yuePiano.prepare(ctx) : Promise.resolve(null);
    Promise.resolve(loading).then(function (voice) {
      if (!known && ui.status && ui.status.textContent === "正在加载钢琴音色") {
        setStatus(voice && voice.kind === "synthetic" ? "采样钢琴加载失败，改用合成音色" : previous);
      }
      window.yuePiano.schedule(ctx, { midi: midi, volume: 0.18 }, ctx.currentTime + 0.02, 0.42, ui.osc);
    });
  }

  function playbackTransport(hasSource, mode) {
    return hasSource && mode === "source" ? "source" : "midi";
  }

  // The red line is the score clock. Original audio is not aligned to the
  // bar, so that line stays off. The paper still scrolls so the glyph the
  // clock has reached sits near the vertical center.
  function showsPlayhead(transport) {
    return transport !== "source";
  }

  function followsScore(transport) {
    return transport === "source" || transport === "midi";
  }

  function playHint() {
    if (ui.audioUrl) {
      return "点唱谱或伴奏上的一个音来改，会响起这个音。可播放 MIDI 或源音频；听源音频时简谱会把大致位置保持在画面中间，点简谱可跳转。歌词在文本谱的词行里改。";
    }
    return "点唱谱或伴奏上的一个音来改，会响起这个音。歌词在文本谱的词行里改。";
  }

  function syncTransport() {
    if (!ui.audioUrl) ui.transport = "midi";
    if (!ui.root) return;
    const show = !!ui.audioUrl;
    ui.root.querySelectorAll("[data-act='mode']").forEach((button) => {
      const mode = button.getAttribute("data-mode");
      const on = show && mode === ui.transport;
      button.hidden = !show;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setTransport(mode) {
    const next = playbackTransport(!!ui.audioUrl, mode);
    if (next === ui.transport) return;
    stopPlayback();
    ui.transport = next;
    syncTransport();
    setStatus(playHint());
  }

  function setPlayLabel(text) {
    if (!ui.root) return;
    const button = ui.root.querySelector("[data-act='play']");
    if (!button) return;
    const playing = text === "暂停";
    button.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    button.setAttribute("aria-label", playing ? "暂停" : "播放");
    button.setAttribute("aria-pressed", playing ? "true" : "false");
    button.title = playing ? "暂停" : "播放";
  }

  function setPlayClock(now, total) {
    if (!ui.clock) return;
    const shown = Math.max(0, now || 0);
    if (total > 0) ui.clock.textContent = formatClock(shown) + " / " + formatClock(total);
    else ui.clock.textContent = formatClock(shown);
  }

  function paintPlayhead(now) {
    const marks = ui.marks && ui.marks.length ? ui.marks : playMarks(ui.abc);
    ui.marks = marks;
    const at = Math.max(0, now || 0);
    if (!showsPlayhead(ui.transport)) {
      if (ui.playhead) {
        ui.playhead.remove();
        ui.playhead = null;
      }
      const vocal = followMark(marks, at);
      if (!vocal) {
        clearPlayhead();
        return;
      }
      const vocalKey = vocal.voice + ":" + vocal.index + ":" + vocal.slice;
      if (vocalKey === ui.playKey) return;
      const vocalNode = headFor(vocal);
      if (!vocalNode) return;
      ui.playKey = vocalKey;
      if (followsScore(ui.transport)) centerPlayhead(vocalNode);
      return;
    }
    const mark = cursorAt(marks, at);
    if (!mark) {
      clearPlayhead();
      return;
    }
    const playKey = mark.voice + ":" + mark.index + ":" + mark.slice;
    const node = headFor(mark);
    if (!node) return;
    if (playKey === ui.playKey && ui.playhead) return;
    ui.playKey = playKey;
    drawPlayhead(node);
    if (followsScore(ui.transport)) followPlayhead(node);
  }

  function abandonSource(message) {
    ui.generation += 1;
    if (ui.raf) cancelAnimationFrame(ui.raf);
    ui.raf = 0;
    if (ui.audio) ui.audio.pause();
    ui.audio = null;
    ui.audioUrl = "";
    ui.sourceTouched = false;
    ui.transport = "midi";
    syncTransport();
    setPlayLabel("播放");
    setStatus(message);
  }

  function ensureAudio() {
    if (!ui.audioUrl || typeof Audio === "undefined") return null;
    if (ui.audio) return ui.audio;
    let audio;
    try {
      audio = new Audio(ui.audioUrl);
    } catch (err) {
      abandonSource("源音频打不开，改为试听简谱。");
      return null;
    }
    audio.preload = "auto";
    audio.addEventListener("error", () => {
      if (ui.audio !== audio || !ui.audioUrl) return;
      abandonSource("源音频打不开，改为试听简谱。");
    });
    audio.addEventListener("ended", () => {
      if (ui.audio !== audio) return;
      ui.generation += 1;
      if (ui.raf) cancelAnimationFrame(ui.raf);
      ui.raf = 0;
      setPlayLabel("播放");
      paintPlayhead(audio.currentTime || 0);
    });
    ui.audio = audio;
    return audio;
  }

  function attachSource(audioFile) {
    const next = fileUrl(audioFile);
    if (next !== ui.audioUrl) {
      if (ui.audio) ui.audio.pause();
      ui.audio = null;
      ui.audioUrl = next;
    }
    if (ui.audioUrl) ensureAudio();
  }

  function seekSource(picked) {
    if (!ui.audioUrl) return;
    const audio = ui.audio || ensureAudio();
    if (!audio || !picked) return;
    const marks = ui.marks && ui.marks.length ? ui.marks : playMarks(ui.abc);
    ui.marks = marks;
    const time = markTime(marks, picked.voice, picked.index, picked.slice);
    if (time == null) return;
    const apply = () => {
      if (ui.audio !== audio) return;
      try { audio.currentTime = time; } catch (err) { return; }
      ui.sourceTouched = true;
      paintPlayhead(time);
      const total = Number.isFinite(audio.duration) ? audio.duration : 0;
      setPlayClock(time, total);
    };
    if (audio.readyState >= 1) apply();
    else audio.addEventListener("loadedmetadata", apply, { once: true });
  }

  function tickSource(audio, generation) {
    if (ui.generation !== generation || ui.audio !== audio) return;
    const now = audio.currentTime || 0;
    const total = Number.isFinite(audio.duration) ? audio.duration : 0;
    setPlayClock(now, total);
    paintPlayhead(now);
    if (!audio.paused && !audio.ended) ui.raf = requestAnimationFrame(() => tickSource(audio, generation));
  }

  function toggleSource() {
    const audio = ensureAudio();
    if (!audio) return;
    if (!audio.paused && !audio.ended) {
      audio.pause();
      ui.generation += 1;
      if (ui.raf) cancelAnimationFrame(ui.raf);
      ui.raf = 0;
      ui.sourceTouched = true;
      setPlayLabel("播放");
      paintPlayhead(audio.currentTime || 0);
      return;
    }
    if (audio.ended || (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.02)) {
      try { audio.currentTime = 0; } catch (err) { /* metadata not ready yet */ }
    }
    const generation = ++ui.generation;
    ui.sourceTouched = true;
    const started = audio.play();
    if (started && typeof started.catch === "function") {
      started.catch(() => {
        if (ui.generation !== generation) return;
        abandonSource("源音频打不开，改为试听简谱。");
      });
    }
    setPlayLabel("暂停");
    tickSource(audio, generation);
  }

  function soundingNotes(notes, offset) {
    const at = Math.max(0, offset || 0);
    const queued = [];
    for (const note of notes || []) {
      const end = note.start + note.duration;
      if (end <= at + 1e-4) continue;
      queued.push({
        note: note,
        delay: Math.max(0, note.start - at),
        duration: end - Math.max(at, note.start),
      });
    }
    return queued;
  }

  // A five-minute score is more than a thousand notes. Scheduling every one
  // at play time stalls the audio thread: the clock still advances, but the
  // speakers stay silent. Arm only the notes that start inside the lookahead.
  function pumpMidi(queue, now, ahead) {
    const horizon = now + (ahead == null ? 1.5 : ahead);
    const due = [];
    for (const item of queue || []) {
      if (!item || item.armed) continue;
      const note = item.note;
      if (!note || note.start > horizon) continue;
      item.armed = true;
      if (note.start + note.duration > now + 0.02) due.push(item);
    }
    return due;
  }

  function silenceMidi() {
    for (const node of ui.osc) {
      try { if (node.stop) node.stop(); } catch (err) { /* already stopped */ }
      try { if (node.disconnect) node.disconnect(); } catch (err) {}
    }
    ui.osc = [];
  }

  function midiNow() {
    if (!ui.midiPlaying || !ui.ctx) return ui.midiOffset || 0;
    const elapsed = ui.ctx.currentTime - ui.midiStartedAt;
    return Math.min(ui.midiTotal || 0, Math.max(0, (ui.midiOffset || 0) + elapsed));
  }

  function stopPlayback() {
    ui.generation += 1;
    ui.arming = false;
    ui.midiPlaying = false;
    ui.midiOffset = 0;
    ui.midiStartedAt = 0;
    ui.midiTotal = 0;
    if (ui.raf) cancelAnimationFrame(ui.raf);
    ui.raf = 0;
    stopEaseScroll();
    silenceMidi();
    if (ui.audio) {
      ui.audio.pause();
      try { ui.audio.currentTime = 0; } catch (err) { /* not seekable yet */ }
    }
    ui.sourceTouched = false;
    heads().forEach((el) => el.classList.remove("yue-play"));
    clearPlayhead();
    setPlayLabel("播放");
    if (ui.clock) ui.clock.textContent = "0:00";
  }

  function pauseMidi() {
    const position = midiNow();
    ui.generation += 1;
    ui.arming = false;
    ui.midiPlaying = false;
    if (ui.raf) cancelAnimationFrame(ui.raf);
    ui.raf = 0;
    silenceMidi();
    ui.midiOffset = Math.max(0, position);
    setPlayLabel("播放");
    if (ui.midiTotal > 0) {
      setPlayClock(ui.midiOffset, ui.midiTotal);
      paintPlayhead(ui.midiOffset);
    }
  }

  function playMidiFrom(position) {
    const score = timeline(ui.abc);
    if (score.error || !score.notes.length) {
      setStatus(score.error || "没有可播放的音符");
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      setStatus("这个浏览器不能播放 MIDI");
      return;
    }
    if (!window.yuePiano) {
      setStatus("钢琴音色未加载");
      return;
    }
    const total = score.notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
    let offset = Math.max(0, position || 0);
    if (offset >= Math.max(0.02, total - 0.02)) offset = 0;
    ui.ctx = ui.ctx || new AudioCtx();
    if (ui.ctx.state === "suspended" && ui.ctx.resume) ui.ctx.resume();
    ui.arming = true;
    ui.midiTotal = total;
    setPlayLabel("暂停");
    const known = window.yuePiano.voice && window.yuePiano.voice(ui.ctx);
    if (!known) setStatus("正在加载钢琴音色");
    const generation = ++ui.generation;
    const loading = window.yuePiano.prepare ? window.yuePiano.prepare(ui.ctx) : Promise.resolve(null);
    Promise.resolve(loading).then(function (voice) {
      if (ui.generation !== generation) return;
      ui.arming = false;
      silenceMidi();
      const t0 = ui.ctx.currentTime + 0.05;
      ui.midiPlaying = true;
      ui.midiOffset = offset;
      ui.midiStartedAt = t0;
      ui.midiTotal = total;
      const queue = soundingNotes(score.notes, offset);
      const pump = () => {
        const elapsed = ui.ctx.currentTime - ui.midiStartedAt;
        const now = Math.min(total, ui.midiOffset + Math.max(0, elapsed));
        for (const item of pumpMidi(queue, now)) {
          window.yuePiano.schedule(
            ui.ctx,
            {
              midi: item.note.midi,
              volume: item.note.volume || 0.16,
              velocity: item.note.velocity,
            },
            ui.midiStartedAt + item.delay,
            Math.max(0.06, item.duration),
            ui.osc,
          );
        }
        return now;
      };
      setStatus(voice && voice.kind === "synthetic" ? "采样钢琴加载失败，改用合成音色" : playHint());
      const marks = playMarks(ui.abc);
      ui.marks = marks;
      const tick = () => {
        if (ui.generation !== generation || !ui.midiPlaying) return;
        const now = pump();
        setPlayClock(now, total);
        const active = new Set();
        for (const note of score.notes) {
          if (now >= note.start && now < note.start + note.duration) {
            note.indexes.forEach((index) => active.add((note.voice || "Vocal") + ":" + index));
          }
        }
        heads().forEach((el) => {
          const key = (el.dataset.voice || "Vocal") + ":" + el.dataset.idx;
          el.classList.toggle("yue-play", active.has(key));
        });
        const mark = cursorAt(marks, Math.max(0, now));
        const playKey = mark ? mark.voice + ":" + mark.index + ":" + mark.slice : "";
        if (playKey !== ui.playKey) {
          const node = headFor(mark);
          if (node) {
            ui.playKey = playKey;
            drawPlayhead(node);
            followPlayhead(node);
          }
        }
        if (now < total - 0.02) ui.raf = requestAnimationFrame(tick);
        else stopPlayback();
      };
      setPlayLabel("暂停");
      tick();
    }).catch(function (err) {
      if (ui.generation !== generation) return;
      ui.arming = false;
      ui.midiPlaying = false;
      setPlayLabel("播放");
      setStatus(String((err && err.message) || err));
    });
  }

  function togglePlay() {
    if (ui.transport === "source" && ui.audioUrl) {
      toggleSource();
      return;
    }
    if (ui.midiPlaying || ui.arming) {
      pauseMidi();
      return;
    }
    playMidiFrom(ui.midiOffset);
  }

  function finish(value) {
    if (ui.textTimer) clearTimeout(ui.textTimer);
    ui.textTimer = 0;
    stopSaveWatch();
    stopPlayback();
    if (ui.root) ui.root.hidden = true;
    const resolve = ui.resolve;
    ui.resolve = null;
    if (resolve) resolve(value);
  }

  function open(abc, audioFile, options) {
    ensureDom();
    stopPlayback();
    stopSaveWatch();
    ui.saveButton = options && options.saveButton || null;
    ui.saveNote = options && options.saveNote || null;
    ui.savedNote = false;
    attachSource(audioFile);
    ui.transport = playbackTransport(!!ui.audioUrl, "source");
    syncTransport();
    if (ui.resolve) ui.resolve(null);
    return new Promise((resolve) => {
      ui.sourceAbc = String(abc || "");
      ui.abc = ui.sourceAbc;
      ui.textDirty = false;
      ui.textBlocked = false;
      ui.textError = "";
      ui.index = -1;
      ui.voice = "Vocal";
      ui.slice = 0;
      refreshTextFromAbc();
      ui.resolve = resolve;
      setStatus(playHint());
      if (ui.clock) ui.clock.textContent = "0:00";
      ui.root.hidden = false;
      applyTextWidth(readSavedTextWidth(), false);
      if (ui.diagram) ui.diagram.value = readSavedDiagram();
      ensureJianpu().then((ok) => {
        if (ui.resolve !== resolve) return;
        if (!ok) {
          ui.paper.innerHTML = "<p>简谱模块没有载入。</p>";
          return;
        }
        renderScore();
      }).catch(() => {
        if (ui.resolve !== resolve) return;
        ui.paper.innerHTML = "<p>简谱模块没有载入。</p>";
      });
      ui.card.focus();
    });
  }

  return {
    DURATIONS: DURATIONS,
    editScore: editScore,
    listEvents: listEvents,
    timeline: timeline,
    spellChord: spellChord,
    soundingNotes: soundingNotes,
    pumpMidi: pumpMidi,
    playMarks: playMarks,
    cursorAt: cursorAt,
    followMark: followMark,
    markTime: markTime,
    fileUrl: fileUrl,
    playbackTransport: playbackTransport,
    showsPlayhead: showsPlayhead,
    followsScore: followsScore,
    inspectScore: inspectScore,
    previewAbc: previewAbc,
    diagramDirective: diagramDirective,
    noteMidi: noteMidi,
    jianpuAbcWithDirective: jianpuAbcWithDirective,
    ensureJianpu: ensureJianpu,
    countHeads: countHeads,
    headIndexes: headIndexes,
    lyricIsDrawn: lyricIsDrawn,
    assignLyricHits: assignLyricHits,
    glyphsUnderNotes: glyphsUnderNotes,
    emptyLyricSlots: emptyLyricSlots,
    nearestHead: nearestHead,
    splitLyricLine: splitLyricLine,
    commandOfKey: commandOfKey,
    formatJianpuText: formatJianpuText,
    buildJianpuText: buildJianpuText,
    parseJianpuText: parseJianpuText,
    textMarkFor: textMarkFor,
    textSpanFor: textSpanFor,
    lyricIndexesInSelection: lyricIndexesInSelection,
    textScrollTarget: textScrollTarget,
    centerScroll: centerScroll,
    compareJianpuNotes: compareJianpuNotes,
    clampTextWidth: clampTextWidth,
    open: open,
    currentAbc: currentAbc,
  };
});
