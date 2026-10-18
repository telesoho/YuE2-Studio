/**
 * Jianpu editor for Yue Studio.
 * The page shows the vocal staff (V:) and the accompaniment staff (A:).
 * Both staves edit in the browser. w: lyrics stay on the vocal staff.
 * Lyrics are edited on L: lines in the text score. Selecting those words
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


  let strings = {};
  function setStrings(next) {
    strings = next && typeof next === "object" ? next : {};
    applyChrome();
  }
  const MARK_VOCAL = "V:";
  const MARK_INS = "A:";
  const MARK_LYRIC = "L:";

  // Voice label of a text-score line, or "" when the line is not one.
  // Bare V / A are notes or words, not labels. Old 唱 / 伴 still read.
  function voiceOfMark(trim) {
    if (trim === MARK_VOCAL || trim === "v:" || trim === "唱") return "Vocal";
    if (trim === MARK_INS || trim === "a:" || trim === "伴") return "Ins";
    return "";
  }

  function voiceMark(voice) {
    return voice === "Ins" ? MARK_INS : MARK_VOCAL;
  }

  // Lyric-line prefix ("L:" / "l:" or legacy 词, plus the spaces after it), or "".
  // L: needs a space or the end of the line, so "Love" stays a word.
  function lyricPrefix(trim) {
    const marked = /^(?:L:|l:)(?:\s+|$)/.exec(trim);
    if (marked) return marked[0];
    const legacy = /^词\s*/.exec(trim);
    return legacy ? legacy[0] : "";
  }

  function m(key, vars) {
    let text = Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : key;
    if (vars) {
      Object.keys(vars).forEach((name) => {
        text = String(text).split("{" + name + "}").join(String(vars[name]));
      });
    }
    return text;
  }
  const DURATIONS = new Set([1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48]);
  const PLAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6l8.2-4.8z"/></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h2.6v10H4zm5.4 0H12v10H9.4z"/></svg>';
  const STOP_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4h8v8H4z"/></svg>';
  const TEXT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5h6.2L13 5.3V14.5H3zm6.2 0v3.8H13M5.2 8h5.6M5.2 10.5h5.6M5.2 13h3.5"/></svg>';
  const DIAGRAM_OFF_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v1.2H2.5zm0 4h11v1.2H2.5zm0 4h11v1.2H2.5zM5 2.2v11.6h1.2V2.2zm4.8 0v11.6H11V2.2z"/><path d="M2.2 13.2 12.8 2.6l1 1L3.2 14.2z"/></svg>';
  const DIAGRAM_GUITAR_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 .8h1v14.8H1zM3.5 .8h1v14.8h-1zM6 .8h1v14.8H6zM8.5 .8h1v14.8h-1zM11 .8h1v14.8H11zM13.5 .8h1v14.8h-1zM1 .8h13.5v1.6H1zM1 6h13.5v.8H1zM1 10.4h13.5v.8H1zM1 14.8h13.5v.8H1zM2.8 13a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 1 1-2.4 0M5.3 8.6a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 1 1-2.4 0M10.3 4.2a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 1 1-2.4 0"/></svg>';
  const DIAGRAM_UKULELE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 .8h1v14.8H1zM5.2 .8h1v14.8h-1zM9.3 .8h1v14.8h-1zM13.5 .8h1v14.8h-1zM1 .8h13.5v1.6H1zM1 6h13.5v.8H1zM1 10.4h13.5v.8H1zM1 14.8h13.5v.8H1zM4.5 8.6a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 1 1-2.4 0M8.6 13a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 1 1-2.4 0M12.8 8.6a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 1 1-2.4 0"/></svg>';
  function diagramIcon(kind) {
    if (kind === "guitar") return DIAGRAM_GUITAR_ICON;
    if (kind === "ukulele") return DIAGRAM_UKULELE_ICON;
    return DIAGRAM_OFF_ICON;
  }
  const MIDI_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1.5v8.1A2.6 2.6 0 1 0 8.6 12V4.8H13V1.5z"/></svg>';
  const SOURCE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.8 6h1.8v4H1.8zm3.2-2h1.8v8H5zm3.2-1.5h1.8v11H8.2zm3.2 2.5h1.8v6h-1.8z"/></svg>';
  const SAVE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h8.5L14 5.5V14H2zm2 0v4h6V2M4.5 9.5h7V14h-7z"/></svg>';
  const DONE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.3 11.6 2.9 8.2l1.4-1.4 2 2 5.5-5.5 1.4 1.4z"/></svg>';
  const CANCEL_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 2.1 8 6.7l4.6-4.6 1.3 1.3L9.3 8l4.6 4.6-1.3 1.3L8 9.3l-4.6 4.6-1.3-1.3L6.7 8 2.1 3.4z"/></svg>';
  const PRINT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h8v3.2H4zm-1.5 4.2h11A1.5 1.5 0 0 1 15 7.2v4.3h-2.5V9.2H3.5v2.3H1V7.2A1.5 1.5 0 0 1 2.5 5.7zm1.8 5.3h7.4V14.5H4.3z"/></svg>';
  const LEAD_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.2h12v1.2H2zm0 3.2h7v1.2H2zm0 3.2h12v1.2H2zm0 3.2h7v1.2H2zM11 6.2l3 2.2-3 2.2z"/></svg>';
  const ALIGN_LYRICS_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.2h2.4v6.2H2zm4.8 0h2.4v6.2H6.8zm4.8 0H14v6.2h-2.4zM1.5 10.8h3.4v1.6H1.5zm4.8 0h3.4v1.6H6.3zm4.8 0H14.5v1.6h-3.4z"/></svg>';
  const UNDO_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 1.8 2 6.2l4.6 4.4V8.2h2.2a2.7 2.7 0 0 1 0 5.4H6.4v1.6h2.4a4.3 4.3 0 0 0 0-8.6H6.6z"/></svg>';
  const REDO_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path transform="translate(16 0) scale(-1 1)" d="M6.6 1.8 2 6.2l4.6 4.4V8.2h2.2a2.7 2.7 0 0 1 0 5.4H6.4v1.6h2.4a4.3 4.3 0 0 0 0-8.6H6.6z"/></svg>';
  const HISTORY_LIMIT = 100;
  const TEXT_BURST_MS = 800;
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
  const SIGNATURE_MINOR = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"];
  const PITCH_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const PITCH_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
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
    const header = parseHeader(String(abc || "").split(/\r?\n/));
    const selected = chosenChordKey(header.key.name);
    const titled = withDisplayTitle(chordsInKey(abc, ui.chordKey), ui.songTitle);
    const src = jianpuAbcWithDirective(withKeyLegend(titled, keyLegend(header.key.name, selected)));
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

  // Spans of an L: line, offsets into the raw line (leading spaces included).
  function lyricLineSpans(line) {
    const raw = String(line == null ? "" : line);
    const lead = raw.length - raw.trimStart().length;
    const trim = raw.trim();
    const prefix = lyricPrefix(trim);
    if (!prefix) return [];
    const origin = lead + prefix.length;
    return lyricBodySpans(trim.slice(prefix.length)).map((span) => ({
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
    // 1:1 with rests only when rest slots are placeholders (* / -).
    const aligned = tokens.length === events.length
      && events.every((ev, i) => ev.kind === "note" || tokens[i] === "*" || tokens[i] === "-");
    if (aligned) {
      events.forEach((ev, index) => {
        ev.lyric = tokens[index];
      });
      return;
    }
    let cursor = 0;
    for (const ev of events) {
      if (ev.kind === "note") ev.lyric = cursor < tokens.length ? tokens[cursor++] : "*";
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
      if (!match) return { error: m('jpErrBadToken') };
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
    if (newSum > perBar) return m('jpErrBarOver');
    if (oldSum === perBar && newSum !== perBar) return m('jpErrBarMismatch');
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
    if (midi < 0 || midi > 127) return m('jpErrOutOfRange');
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
    if (!sizes) return { abc: abc, index: index, error: m('jpErrRestUnsplit') };
    if (slice < 0 || slice >= sizes.length) return { abc: abc, index: index };
    const tokens = sizes.map((units) => "z" + (units === 1 ? "" : String(units))).join("");
    const lines = parsed.lines.slice();
    lines[ev.line] = lines[ev.line].slice(0, ev.start) + tokens + lines[ev.line].slice(ev.end);
    if (voice !== "Ins") padLyricStars(lines, events, ev, sizes.length);
    return { abc: joinAbc(lines, abc), index: index + slice };
  }

  function splitWritable(units) {
    const parts = [];
    let left = units;
    const sizes = [48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1];
    while (left > 0) {
      let take = 0;
      for (let i = 0; i < sizes.length; i++) {
        if (sizes[i] <= left) {
          take = sizes[i];
          break;
        }
      }
      if (!take) return null;
      parts.push(take);
      left -= take;
    }
    return parts;
  }

  function tiePieces(ev, lengths) {
    const rest = ev.kind !== "note";
    return lengths.map((units, i) => Object.assign({}, ev, {
      units: units,
      bars: 1,
      kind: rest ? "rest" : "note",
      letter: rest ? "z" : ev.letter,
      acc: rest ? "" : ev.acc,
      marks: rest ? "" : ev.marks,
      tie: !rest && (i < lengths.length - 1 || !!ev.tie),
      continuesTie: !rest && (i > 0 || !!ev.continuesTie),
      lyric: !rest && i === 0 ? ev.lyric : "*",
      chord: i === 0 ? (ev.chord || "") : "",
    }));
  }

  function piecesAfter(ev, start, cut, perBar) {
    const lengths = [];
    let left = ev.units;
    let at = start;
    while (left > 0) {
      const room = perBar - ((at - cut) % perBar);
      const take = Math.min(left, room);
      const writable = splitWritable(take);
      if (!writable) return null;
      for (let i = 0; i < writable.length; i++) lengths.push(writable[i]);
      at += take;
      left -= take;
    }
    return tiePieces(ev, lengths);
  }

  function flattenVoice(items, start, end, voice) {
    const out = [];
    let ordinal = 0;
    let open = false;
    function nextBar() {
      if (open) ordinal += 1;
      open = true;
      return ordinal;
    }
    for (let i = start; i < end; i++) {
      const item = items[i];
      if (item.type !== "music" || item.voice !== voice) continue;
      let prev = null;
      for (const ev of item.events) {
        if (ev.kind === "zrest") {
          const count = ev.bars > 0 ? ev.bars : 1;
          for (let b = 0; b < count; b++) {
            out.push(Object.assign({}, ev, {
              kind: "rest",
              units: ev.perBar,
              bars: 1,
              letter: "z",
              acc: "",
              marks: "",
              tie: false,
              continuesTie: false,
              lyric: "*",
              chord: b === 0 ? (ev.chord || "") : "",
              originalBar: nextBar(),
              sourceIndex: b === 0 ? ev.index : -1,
            }));
          }
          prev = null;
          continue;
        }
        const bar = prev === ev.barIndex ? ordinal : nextBar();
        prev = ev.barIndex;
        out.push(Object.assign({}, ev, { originalBar: bar, sourceIndex: ev.index }));
      }
    }
    return out;
  }

  function placeVoice(events, cut, perBar) {
    let cursor = 0;
    let cutBar = null;
    const placed = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const start = cursor;
      cursor += ev.units;
      if (start + ev.units <= cut) {
        placed.push({ ev: ev, bar: ev.originalBar, start: start });
        continue;
      }
      if (cutBar == null) {
        if (start < cut) cutBar = ev.originalBar;
        else if (start === cut) {
          let prior = false;
          for (let j = 0; j < i; j++) {
            if (events[j].originalBar === ev.originalBar) prior = true;
          }
          cutBar = prior ? ev.originalBar : ev.originalBar - 1;
        } else {
          return null;
        }
      }
      let pieces;
      let at = start;
      if (start < cut) {
        const head = splitWritable(cut - start);
        const tail = splitWritable(start + ev.units - cut);
        if (!head || !tail) return null;
        pieces = tiePieces(ev, head.concat(tail));
        const headCount = head.length;
        for (let p = 0; p < pieces.length; p++) {
          const bar = p < headCount ? cutBar : cutBar + 1 + Math.floor((at - cut) / perBar);
          placed.push({ ev: pieces[p], bar: bar, start: at, pick: false });
          at += pieces[p].units;
        }
        continue;
      }
      pieces = piecesAfter(ev, start, cut, perBar);
      if (!pieces) return null;
      for (let p = 0; p < pieces.length; p++) {
        const bar = cutBar + 1 + Math.floor((at - cut) / perBar);
        placed.push({ ev: pieces[p], bar: bar, start: at, pick: start === cut && p === 0 });
        at += pieces[p].units;
      }
    }
    if (cutBar == null || cursor < cut) return null;
    let min = placed.length ? placed[0].bar : 0;
    for (const piece of placed) if (piece.bar < min) min = piece.bar;
    if (min < 0) {
      for (const piece of placed) piece.bar -= min;
    }
    return placed;
  }

  function barsOf(placed) {
    if (!placed.length) return [];
    let max = 0;
    for (const piece of placed) if (piece.bar > max) max = piece.bar;
    const bars = [];
    for (let i = 0; i <= max; i++) bars.push([]);
    for (const piece of placed) bars[piece.bar].push(piece.ev);
    for (const bar of bars) if (!bar.length) return null;
    return bars;
  }

  function renderBars(bars, state) {
    return bars.map((bar) => bar.map((ev) => abcPiece(ev, state)).join(" ")).join(" | ") + "|";
  }

  function sameMeter(a, b) {
    return !!a && !!b && a[0] === b[0] && a[1] === b[1];
  }

  // The selected note becomes beat 1 of the next bar. Bars before that bar stay.
  // From the cut through the next section comment or meter change, both voices
  // are packed again to the meter, within the user's bars-per-line range.
  function reflowDownbeat(abc, voice, index, command) {
    const walked = walkBody(abc);
    if (walked.error) return { abc: abc, error: walked.error };
    const items = walked.items;
    let at = -1;
    for (let i = 0; i < items.length && at < 0; i++) {
      const item = items[i];
      if (item.type !== "music" || item.voice !== voice) continue;
      for (const ev of item.events) {
        if (ev.index === index) {
          at = i;
          break;
        }
      }
    }
    if (at < 0) return { abc: abc, error: m("jpErrNoSuchNote") };
    const meter = items[at].meter;
    const perBar = perBarUnits(meter, walked.header.lDen);
    if (!Number.isInteger(perBar) || perBar <= 0) return { abc: abc, error: m("jpErrBadMeter") };
    let start = at;
    while (start > 0) {
      const prev = items[start - 1];
      if (prev.type !== "music" || !sameMeter(prev.meter, meter)) break;
      start -= 1;
    }
    let end = at + 1;
    while (end < items.length) {
      const next = items[end];
      if (next.type !== "music" || !sameMeter(next.meter, meter)) break;
      end += 1;
    }
    const selected = flattenVoice(items, start, end, voice);
    const otherName = voice === "Ins" ? "Vocal" : "Ins";
    const other = flattenVoice(items, start, end, otherName);
    if (!selected.length || !other.length) return { abc: abc, error: m("jpErrVoicesBars") };
    let cut = 0;
    let found = false;
    for (const ev of selected) {
      if (ev.sourceIndex === index) {
        found = true;
        break;
      }
      cut += ev.units;
    }
    if (!found) return { abc: abc, error: m("jpErrNoSuchNote") };
    const chosen = selected.find((item) => item.sourceIndex === index);
    let prior = false;
    for (const ev of selected) {
      if (ev === chosen) break;
      if (ev.originalBar === chosen.originalBar) prior = true;
    }
    if (!prior) return { abc: abc, error: m("jpErrAlreadyDownbeat") };
    const placedSel = placeVoice(selected, cut, perBar);
    const placedOther = placeVoice(other, cut, perBar);
    if (!placedSel || !placedOther) return { abc: abc, error: m("jpErrVoicesBars") };
    const barsSel = barsOf(placedSel);
    const barsOther = barsOf(placedOther);
    if (!barsSel || !barsOther || barsSel.length !== barsOther.length) {
      return { abc: abc, error: m("jpErrVoicesBars") };
    }
    const vocalBars = voice === "Ins" ? barsOther : barsSel;
    const insBars = voice === "Ins" ? barsSel : barsOther;
    let vocalKey = null;
    let insKey = null;
    for (let i = start; i < end; i++) {
      if (items[i].type !== "music") continue;
      if (items[i].voice === "Vocal" && vocalKey == null) vocalKey = items[i].startKey;
      if (items[i].voice === "Ins" && insKey == null) insKey = items[i].startKey;
    }
    let beforeMeter = walked.header.meter;
    for (let i = start - 1; i >= 0; i--) {
      if (items[i].type === "music") {
        beforeMeter = items[i].meter;
        break;
      }
    }
    const meterLine = sameMeter(meter, beforeMeter) ? "" : "M:" + meter[0] + "/" + meter[1];
    const stateV = { key: vocalKey || walked.header.key.name };
    const stateI = { key: insKey || walked.header.key.name };
    const diagram = normalizeDiagram(command && command.diagram);
    const range = lineBarRange(command);
    const widths = [];
    for (let b = 0; b < vocalBars.length; b++) {
      widths.push(Math.max(
        barNaturalWidth(vocalBars[b], diagram),
        barNaturalWidth(insBars[b], diagram),
      ));
    }
    const chunks = packBarChunks(widths, range.min, range.max);
    const region = [];
    for (let g = 0; g < chunks.length; g++) {
      const chunkV = vocalBars.slice(chunks[g].from, chunks[g].to);
      const chunkI = insBars.slice(chunks[g].from, chunks[g].to);
      region.push("V: Vocal");
      if (g === 0 && meterLine) region.push(meterLine);
      region.push(renderBars(chunkV, stateV));
      const lyric = lyricAbc({ bars: chunkV });
      if (lyric) region.push(lyric);
      region.push("V: Ins");
      if (g === 0 && meterLine) region.push(meterLine);
      region.push(renderBars(chunkI, stateI));
    }
    let from = items[start].vLine;
    let to = items[start].musicLine;
    for (let i = start; i < end; i++) {
      if (items[i].type !== "music") continue;
      if (items[i].vLine < from) from = items[i].vLine;
      const last = items[i].lyricLine >= 0 ? items[i].lyricLine : items[i].musicLine;
      if (last > to) to = last;
    }
    const lines = walked.lines.slice();
    lines.splice(from, to - from + 1, ...region);
    let before = 0;
    for (let i = 0; i < start; i++) {
      if (items[i].type === "music" && items[i].voice === voice) before += items[i].events.length;
    }
    const pick = placedSel.findIndex((piece) => piece.pick);
    return { abc: joinAbc(lines, abc), error: null, index: before + (pick < 0 ? 0 : pick) };
  }

  // Furigana in 目(め) sits above the base; it must not inflate line packing.
  function lyricPackWidth(lyric) {
    const text = displayLyricToken(lyric)
      .replace(/（[^）]*）|\([^)]*\)/g, "");
    let w = 0;
    for (const ch of text) {
      if (!ch || ch === "·" || ch === "-") continue;
      w += isCjkChar(ch) ? 1 : 0.55;
    }
    return w;
  }

  // One event = one syllable slot; drawn lyrics widen the slot by glyph width.
  function eventNaturalWidth(ev, diagram) {
    let w = 1;
    if (ev.chord) {
      if (diagram === "guitar" || diagram === "ukulele") w = Math.max(w, 2.2);
      else w = Math.max(w, Math.min(String(ev.chord).length * 0.45, 2.5));
    }
    if (lyricIsDrawn(ev.lyric)) w = Math.max(w, lyricPackWidth(ev.lyric));
    return w;
  }

  function barNaturalWidth(bar, diagram) {
    let sum = 0;
    for (const ev of bar) sum += eventNaturalWidth(ev, diagram);
    return sum;
  }

  // One ordinary bar is 8 wide. LINE scales with the maximum so that maximum is reachable.
  const BAR_LINE_MIN = 1;
  const BAR_LINE_CAP = 8;
  const BAR_LINE_DEFAULT_MAX = 4;
  const BARS_MIN_KEY = "yue-jp-bars-min";
  const BARS_MAX_KEY = "yue-jp-bars-max";

  function storedBarCount(key) {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(key);
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      return Number.isInteger(n) ? n : null;
    } catch (_err) {
      return null;
    }
  }

  function clampBarCount(value, fallback) {
    const n = Number(value);
    if (!Number.isInteger(n)) return fallback;
    if (n < BAR_LINE_MIN) return BAR_LINE_MIN;
    if (n > BAR_LINE_CAP) return BAR_LINE_CAP;
    return n;
  }

  function normalizeBarRange(min, max) {
    min = clampBarCount(min, BAR_LINE_MIN);
    max = clampBarCount(max, BAR_LINE_DEFAULT_MAX);
    if (min > max) min = max;
    return { min: min, max: max };
  }

  function loadBarsPerLine() {
    const savedMin = storedBarCount(BARS_MIN_KEY);
    const savedMax = storedBarCount(BARS_MAX_KEY);
    return normalizeBarRange(
      savedMin == null ? BAR_LINE_MIN : savedMin,
      savedMax == null ? BAR_LINE_DEFAULT_MAX : savedMax,
    );
  }

  let barsPerLine = loadBarsPerLine();

  function lineBarRange(command) {
    const minGiven = command && command.minBars != null && command.minBars !== "";
    const maxGiven = command && command.maxBars != null && command.maxBars !== "";
    return normalizeBarRange(
      minGiven ? command.minBars : barsPerLine.min,
      maxGiven ? command.maxBars : barsPerLine.max,
    );
  }

  function writeBarsPerLine() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(BARS_MIN_KEY, String(barsPerLine.min));
      localStorage.setItem(BARS_MAX_KEY, String(barsPerLine.max));
    } catch (_err) {
      /* private mode and file pages can reject storage */
    }
  }

  function syncBarInputs() {
    if (!ui || !ui.tools) return;
    ui.tools.querySelectorAll("input[data-bars]").forEach((input) => {
      const which = input.getAttribute("data-bars");
      const next = String(which === "min" ? barsPerLine.min : barsPerLine.max);
      if (input.value !== next) input.value = next;
      const label = m(which === "min" ? "jpBarsMin" : "jpBarsMax");
      input.title = label;
      input.setAttribute("aria-label", label);
    });
  }

  // Read both fields together. A toolbar button mousedown prevents blur, so
  // `change` has not fired yet when Reflow runs.
  function pullBarInputs(edited) {
    if (!ui || !ui.tools) return;
    const minEl = ui.tools.querySelector("input[data-bars='min']");
    const maxEl = ui.tools.querySelector("input[data-bars='max']");
    if (!minEl || !maxEl) return;
    const minRaw = String(minEl.value).trim();
    const maxRaw = String(maxEl.value).trim();
    let min = /^\d+$/.test(minRaw) ? clampBarCount(Number(minRaw), barsPerLine.min) : barsPerLine.min;
    let max = /^\d+$/.test(maxRaw) ? clampBarCount(Number(maxRaw), barsPerLine.max) : barsPerLine.max;
    if (min > max) {
      if (edited === "min") max = min;
      else min = max;
    }
    barsPerLine = { min: min, max: max };
    writeBarsPerLine();
    syncBarInputs();
  }

  function barCountField(which) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(BAR_LINE_MIN);
    input.max = String(BAR_LINE_CAP);
    input.step = "1";
    input.className = "yue-jp-bars";
    input.setAttribute("data-bars", which);
    input.value = String(which === "min" ? barsPerLine.min : barsPerLine.max);
    const label = m(which === "min" ? "jpBarsMin" : "jpBarsMax");
    input.title = label;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => pullBarInputs(which));
    return input;
  }

  // Stay inside [min, max] bars. Width may stop early, but not before min.
  // A bar that already fills the line stays alone only when min allows one bar.
  function packBarChunks(widths, minBars, maxBars) {
    const range = normalizeBarRange(minBars, maxBars);
    const min = range.min;
    const max = range.max;
    const LINE = 8 * max;
    const ALONE = LINE / 2;
    const chunks = [];
    let i = 0;
    while (i < widths.length) {
      const floor = Math.min(min, widths.length - i);
      if (floor <= 1 && widths[i] >= ALONE) {
        chunks.push({ from: i, to: i + 1 });
        i += 1;
        continue;
      }
      let sum = 0;
      let count = 0;
      const from = i;
      while (i < widths.length && count < max) {
        if (count >= floor && (widths[i] >= ALONE || sum + widths[i] > LINE)) break;
        sum += widths[i];
        count += 1;
        i += 1;
      }
      chunks.push({ from: from, to: from + count });
    }
    return chunks;
  }

  function barsFromVoice(items, start, end, voice) {
    const flat = flattenVoice(items, start, end, voice);
    if (!flat.length) return [];
    return barsOf(flat.map((ev) => ({ ev: ev, bar: ev.originalBar })));
  }

  // Rewrite line breaks so each system has a similar natural width. Notes stay put.
  function reflowScore(abc, command) {
    const walked = walkBody(abc);
    if (walked.error) return { abc: abc, error: walked.error };
    const diagram = normalizeDiagram(command && command.diagram);
    const items = walked.items;
    const regions = [];
    let i = 0;
    while (i < items.length) {
      if (items[i].type !== "music") {
        i += 1;
        continue;
      }
      const meter = items[i].meter;
      const start = i;
      let end = i + 1;
      while (end < items.length && items[end].type === "music" && sameMeter(items[end].meter, meter)) {
        end += 1;
      }
      regions.push({ start: start, end: end, meter: meter });
      i = end;
    }
    let lines = walked.lines.slice();
    for (let r = regions.length - 1; r >= 0; r--) {
      const region = regions[r];
      const vocalBars = barsFromVoice(items, region.start, region.end, "Vocal");
      const insBars = barsFromVoice(items, region.start, region.end, "Ins");
      if (!vocalBars.length || !insBars.length || vocalBars.length !== insBars.length) {
        return { abc: abc, error: m("jpErrVoicesBars") };
      }
      const widths = [];
      for (let b = 0; b < vocalBars.length; b++) {
        widths.push(Math.max(
          barNaturalWidth(vocalBars[b], diagram),
          barNaturalWidth(insBars[b], diagram),
        ));
      }
      const range = lineBarRange(command);
      const chunks = packBarChunks(widths, range.min, range.max);
      let vocalKey = null;
      let insKey = null;
      for (let j = region.start; j < region.end; j++) {
        if (items[j].type !== "music") continue;
        if (items[j].voice === "Vocal" && vocalKey == null) vocalKey = items[j].startKey;
        if (items[j].voice === "Ins" && insKey == null) insKey = items[j].startKey;
      }
      let beforeMeter = walked.header.meter;
      for (let j = region.start - 1; j >= 0; j--) {
        if (items[j].type === "music") {
          beforeMeter = items[j].meter;
          break;
        }
      }
      const meterLine = sameMeter(region.meter, beforeMeter)
        ? ""
        : "M:" + region.meter[0] + "/" + region.meter[1];
      const stateV = { key: vocalKey || walked.header.key.name };
      const stateI = { key: insKey || walked.header.key.name };
      const out = [];
      for (let g = 0; g < chunks.length; g++) {
        const chunkV = vocalBars.slice(chunks[g].from, chunks[g].to);
        const chunkI = insBars.slice(chunks[g].from, chunks[g].to);
        out.push("V: Vocal");
        if (g === 0 && meterLine) out.push(meterLine);
        out.push(renderBars(chunkV, stateV));
        const lyric = lyricAbc({ bars: chunkV });
        if (lyric) out.push(lyric);
        out.push("V: Ins");
        if (g === 0 && meterLine) out.push(meterLine);
        out.push(renderBars(chunkI, stateI));
      }
      let from = items[region.start].vLine;
      let to = items[region.start].musicLine;
      for (let j = region.start; j < region.end; j++) {
        if (items[j].type !== "music") continue;
        if (items[j].vLine < from) from = items[j].vLine;
        const last = items[j].lyricLine >= 0 ? items[j].lyricLine : items[j].musicLine;
        if (last > to) to = last;
      }
      lines.splice(from, to - from + 1, ...out);
    }
    return { abc: joinAbc(lines, abc), error: null };
  }

  // A multi-bar Z expands into consecutive rests whose later slices have no sourceIndex.
  function barOrdinal(flat, index, slice) {
    const at = slice > 0 ? slice : 0;
    for (let i = 0; i < flat.length; i++) {
      if (flat[i].sourceIndex !== index) continue;
      let span = 1;
      while (i + span < flat.length && flat[i + span].sourceIndex < 0
          && flat[i + span].originalBar === flat[i].originalBar + span) {
        span += 1;
      }
      if (span > 1) {
        if (at >= span) return -1;
        return flat[i + at].originalBar;
      }
      return flat[i].originalBar;
    }
    return -1;
  }

  function quarterBeats(units, lDen) {
    if (!lDen) return 0;
    return Math.round(units * 4 / lDen * 10) / 10;
  }

  // The bar containing the note, inside one stretch of the same meter.
  function locateBar(abc, voice, index, slice) {
    const walked = walkBody(abc);
    if (walked.error) return { error: walked.error };
    const items = walked.items;
    let at = -1;
    for (let i = 0; i < items.length && at < 0; i++) {
      const item = items[i];
      if (item.type !== "music" || item.voice !== voice) continue;
      for (const ev of item.events) {
        if (ev.index === index) {
          at = i;
          break;
        }
      }
    }
    if (at < 0) return { error: m("jpErrNoSuchNote") };
    const meter = items[at].meter;
    let start = at;
    while (start > 0) {
      const prev = items[start - 1];
      if (prev.type !== "music" || !sameMeter(prev.meter, meter)) break;
      start -= 1;
    }
    let end = at + 1;
    while (end < items.length) {
      const next = items[end];
      if (next.type !== "music" || !sameMeter(next.meter, meter)) break;
      end += 1;
    }
    const vocalFlat = flattenVoice(items, start, end, "Vocal");
    const insFlat = flattenVoice(items, start, end, "Ins");
    const vocalBars = barsOf(vocalFlat.map((ev) => ({ ev: ev, bar: ev.originalBar })));
    const insBars = barsOf(insFlat.map((ev) => ({ ev: ev, bar: ev.originalBar })));
    if (!vocalBars || !insBars || !vocalBars.length || vocalBars.length !== insBars.length) {
      return { error: m("jpErrVoicesBars") };
    }
    const bar = barOrdinal(voice === "Ins" ? insFlat : vocalFlat, index, slice);
    if (bar < 0) return { error: m("jpErrNoSuchNote") };
    return {
      error: null,
      walked: walked,
      items: items,
      start: start,
      end: end,
      meter: meter,
      vocalBars: vocalBars,
      insBars: insBars,
      bar: bar,
    };
  }

  function joinLocate(abc, voice, index, slice) {
    const found = locateBar(abc, voice, index, slice);
    if (found.error) return found;
    if (found.bar + 1 >= found.vocalBars.length) return { error: m("jpErrJoinLast") };
    const heads = [];
    function take(bars, which) {
      const events = bars[found.bar].concat(bars[found.bar + 1]);
      for (const ev of events) {
        if (ev.index == null || ev.index < 0) continue;
        heads.push({ voice: which, index: ev.index });
      }
    }
    take(found.vocalBars, "Vocal");
    take(found.insBars, "Ins");
    found.heads = heads;
    return found;
  }

  function eventsBefore(items, start, voice) {
    let n = 0;
    for (let i = 0; i < start; i++) {
      if (items[i].type === "music" && items[i].voice === voice) n += items[i].events.length;
    }
    return n;
  }

  function vocalBarCount(items) {
    const flat = flattenVoice(items, 0, items.length, "Vocal");
    let max = -1;
    for (const ev of flat) if (ev.originalBar > max) max = ev.originalBar;
    return max + 1;
  }

  // One beat is the denominator note. 3/4 with L:1/4 is one unit; L:1/8 is two.
  function oneBeatUnits(meter, lDen) {
    const units = meter && meter[1] ? lDen / meter[1] : 0;
    if (!Number.isInteger(units) || units < 1) return { error: m("jpErrBadUnit") };
    if (!DURATIONS.has(units)) return { error: m("jpErrDuration") };
    return { units: units };
  }

  function beatRest(sample, units) {
    return Object.assign({}, sample, {
      kind: "rest",
      units: units,
      bars: 1,
      letter: "z",
      acc: "",
      marks: "",
      tie: false,
      continuesTie: false,
      lyric: "*",
      chord: "",
      sourceIndex: -1,
      index: -1,
    });
  }

  function breakOutgoing(fromBar, toBar) {
    if (!fromBar || !fromBar.length) return;
    const tail = fromBar[fromBar.length - 1];
    if (!tail.tie) return;
    tail.tie = false;
    if (toBar && toBar.length && toBar[0].continuesTie) toBar[0].continuesTie = false;
  }

  function barBeats(events, meter, lDen) {
    let units = 0;
    for (const ev of events) units += ev.units;
    const count = quarterBeats(units, lDen);
    const meterCount = quarterBeats(perBarUnits(meter, lDen), lDen);
    return Math.abs(count - meterCount) > 0.05 ? count : null;
  }

  function indexInBar(items, start, bars, voice, bar, atEnd) {
    let n = eventsBefore(items, start, voice);
    const stop = atEnd ? bar + 1 : bar;
    for (let b = 0; b < stop && b < bars.length; b++) n += bars[b].length;
    return atEnd ? Math.max(0, n - 1) : n;
  }

  // The same note after a rewrite, or the first event of its bar when a rest slice expanded.
  function sameNoteIndex(items, start, bars, voice, bar, sourceIndex) {
    let n = eventsBefore(items, start, voice);
    for (let b = 0; b < bars.length; b++) {
      for (let e = 0; e < bars[b].length; e++) {
        if (b === bar && bars[b][e].sourceIndex === sourceIndex) return n;
        n += 1;
      }
    }
    return indexInBar(items, start, bars, voice, bar, false);
  }

  function indexAfterDelete(items, start, bars, voice, bar) {
    const before = eventsBefore(items, start, voice);
    if (bar < bars.length) return indexInBar(items, start, bars, voice, bar, false);
    if (bars.length) return indexInBar(items, start, bars, voice, bars.length - 1, true);
    return Math.max(0, before - 1);
  }

  // Rewrite one meter stretch. Consecutive bars that share a meter stay on the
  // same lines; a meter change gets its own M: and is packed on its own.
  function writeRegion(abc, found, vocalBars, insBars, meters, command) {
    const items = found.items;
    const walked = found.walked;
    let from = items[found.start].vLine;
    let to = items[found.start].musicLine;
    for (let j = found.start; j < found.end; j++) {
      if (items[j].type !== "music") continue;
      if (items[j].vLine < from) from = items[j].vLine;
      const last = items[j].lyricLine >= 0 ? items[j].lyricLine : items[j].musicLine;
      if (last > to) to = last;
    }
    const lines = walked.lines.slice();
    if (!vocalBars.length) {
      lines.splice(from, to - from + 1);
      return { abc: joinAbc(lines, abc) };
    }
    let vocalKey = null;
    let insKey = null;
    for (let j = found.start; j < found.end; j++) {
      if (items[j].type !== "music") continue;
      if (items[j].voice === "Vocal" && vocalKey == null) vocalKey = items[j].startKey;
      if (items[j].voice === "Ins" && insKey == null) insKey = items[j].startKey;
    }
    let sounding = walked.header.meter;
    for (let j = found.start - 1; j >= 0; j--) {
      if (items[j].type === "music") {
        sounding = items[j].meter;
        break;
      }
    }
    const runs = [];
    for (let i = 0; i < vocalBars.length; i++) {
      const last = runs[runs.length - 1];
      if (last && sameMeter(last.meter, meters[i])) last.to = i + 1;
      else runs.push({ from: i, to: i + 1, meter: meters[i] });
    }
    const diagram = normalizeDiagram(command && command.diagram);
    const range = lineBarRange(command);
    const stateV = { key: vocalKey || walked.header.key.name };
    const stateI = { key: insKey || walked.header.key.name };
    const out = [];
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const meterLine = sameMeter(run.meter, sounding) ? "" : "M:" + run.meter[0] + "/" + run.meter[1];
      const widths = [];
      for (let b = run.from; b < run.to; b++) {
        widths.push(Math.max(
          barNaturalWidth(vocalBars[b], diagram),
          barNaturalWidth(insBars[b], diagram),
        ));
      }
      const chunks = packBarChunks(widths, range.min, range.max);
      for (let g = 0; g < chunks.length; g++) {
        const chunkV = vocalBars.slice(run.from + chunks[g].from, run.from + chunks[g].to);
        const chunkI = insBars.slice(run.from + chunks[g].from, run.from + chunks[g].to);
        out.push("V: Vocal");
        if (g === 0 && meterLine) out.push(meterLine);
        out.push(renderBars(chunkV, stateV));
        const lyric = lyricAbc({ bars: chunkV });
        if (lyric) out.push(lyric);
        out.push("V: Ins");
        if (g === 0 && meterLine) out.push(meterLine);
        out.push(renderBars(chunkI, stateI));
      }
      sounding = run.meter;
    }
    lines.splice(from, to - from + 1, ...out);
    return { abc: joinAbc(lines, abc) };
  }

  // Drop the barline between this bar and the next. Other bars stay.
  // Line breaks are repacked; the meter is not.
  function joinBars(abc, voice, index, slice, command) {
    const found = joinLocate(abc, voice, index, slice);
    if (found.error) return { abc: abc, error: found.error };
    const vocalBars = found.vocalBars.slice();
    const insBars = found.insBars.slice();
    vocalBars[found.bar] = found.vocalBars[found.bar].concat(found.vocalBars[found.bar + 1]);
    insBars[found.bar] = found.insBars[found.bar].concat(found.insBars[found.bar + 1]);
    vocalBars.splice(found.bar + 1, 1);
    insBars.splice(found.bar + 1, 1);
    const meters = vocalBars.map(() => found.meter);
    const written = writeRegion(abc, found, vocalBars, insBars, meters, command);
    const chosen = voice === "Ins" ? insBars[found.bar] : vocalBars[found.bar];
    const beats = barBeats(chosen, found.meter, found.walked.header.lDen);
    return { abc: written.abc, error: null, beats: beats };
  }

  // This bar's numerator grows by one. Both voices gain a rest of one beat at the end.
  function addBeat(abc, voice, index, slice, command) {
    const found = locateBar(abc, voice, index, slice);
    if (found.error) return { abc: abc, error: found.error };
    const beat = oneBeatUnits(found.meter, found.walked.header.lDen);
    if (beat.error) return { abc: abc, error: beat.error };
    const vocalBars = found.vocalBars.slice();
    const insBars = found.insBars.slice();
    const bar = found.bar;
    breakOutgoing(vocalBars[bar], vocalBars[bar + 1]);
    breakOutgoing(insBars[bar], insBars[bar + 1]);
    const vBar = vocalBars[bar].slice();
    const iBar = insBars[bar].slice();
    vBar.push(beatRest(vBar[vBar.length - 1], beat.units));
    iBar.push(beatRest(iBar[iBar.length - 1], beat.units));
    vocalBars[bar] = vBar;
    insBars[bar] = iBar;
    const next = [found.meter[0] + 1, found.meter[1]];
    const meters = vocalBars.map((_, i) => (i === bar ? next : found.meter));
    const written = writeRegion(abc, found, vocalBars, insBars, meters, command);
    const which = voice === "Ins" ? insBars : vocalBars;
    return {
      abc: written.abc,
      error: null,
      beats: barBeats(which[bar], next, found.walked.header.lDen),
      index: sameNoteIndex(found.items, found.start, which, voice, bar, index),
    };
  }

  // Remove this bar from both voices. The only bar in the score stays.
  function deleteBar(abc, voice, index, slice, command) {
    const found = locateBar(abc, voice, index, slice);
    if (found.error) return { abc: abc, error: found.error };
    if (vocalBarCount(found.items) <= 1) return { abc: abc, error: m("jpErrDeleteLast") };
    const vocalBars = found.vocalBars.slice();
    const insBars = found.insBars.slice();
    const bar = found.bar;
    if (bar > 0) {
      breakOutgoing(vocalBars[bar - 1], vocalBars[bar]);
      breakOutgoing(insBars[bar - 1], insBars[bar]);
    }
    breakOutgoing(vocalBars[bar], vocalBars[bar + 1]);
    breakOutgoing(insBars[bar], insBars[bar + 1]);
    vocalBars.splice(bar, 1);
    insBars.splice(bar, 1);
    const meters = vocalBars.map(() => found.meter);
    const written = writeRegion(abc, found, vocalBars, insBars, meters, command);
    const which = voice === "Ins" ? insBars : vocalBars;
    return {
      abc: written.abc,
      error: null,
      index: indexAfterDelete(found.items, found.start, which, voice, bar),
    };
  }

  function editScore(abc, command) {
    if (command.op === "reflow") return reflowScore(abc, command);
    const voice = command.voice === "Ins" ? "Ins" : "Vocal";
    if (command.op === "join") {
      return joinBars(abc, voice, command.index | 0, command.slice | 0, command);
    }
    if (command.op === "add-beat") {
      return addBeat(abc, voice, command.index | 0, command.slice | 0, command);
    }
    if (command.op === "delete-bar") {
      return deleteBar(abc, voice, command.index | 0, command.slice | 0, command);
    }
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
      return { abc: abc, error: voice === "Ins" ? m('jpErrNoInsNotes') : m('jpErrNoVocalNotes') };
    }
    if (index < 0 || index >= events.length) return { abc: abc, error: m('jpErrNoSuchNote') };
    const op = command.op;
    if (op === "downbeat") return reflowDownbeat(abc, voice, index, command);
    const ev = events[index];
    let lyricsDirty = false;
    let leftover = 0;
    let select = index;
    const oldSum = barSum(events, ev);

    if (op === "degree") {
      const degree = command.degree | 0;
      if (ev.kind === "zrest" && (ev.bars !== 1 || !checkUnits(ev.units))) {
        return { abc: abc, error: m('jpErrWholeRestToNote') };
      }
      const wasRest = ev.kind !== "note";
      breakTies(events, index);
      if (degree === 0) {
        makeRest(ev);
        lyricsDirty = true;
      } else if (degree >= 1 && degree <= 7) {
        const jp = ev.kind === "note" ? readJp(ev) : { octave: 0 };
        const spelled = spell(degree, jp.octave || 0, ev.key, 0);
        if (!spelled) return { abc: abc, error: m('jpErrOutOfRange') };
        const range = applySpelling(ev, spelled);
        if (range) return { abc: abc, error: range };
        if (wasRest) {
          ev.lyric = "*";
          lyricsDirty = true;
        }
      } else {
        return { abc: abc, error: m('jpErrDegreeRange') };
      }
    } else if (op === "octave") {
      if (ev.kind !== "note") return { abc: abc, error: m('jpErrRestNoOctave') };
      const jp = readJp(ev);
      const spelled = spell(jp.degree, jp.octave + (command.delta | 0), ev.key, jp.relative);
      if (!spelled) return { abc: abc, error: m('jpErrOutOfRange') };
      breakTies(events, index);
      const range = applySpelling(ev, spelled);
      if (range) return { abc: abc, error: range };
    } else if (op === "accidental") {
      if (ev.kind !== "note") return { abc: abc, error: m('jpErrRestNoAccidental') };
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
      if (!spelled) return { abc: abc, error: m('jpErrOutOfRange') };
      breakTies(events, index);
      const range = applySpelling(ev, spelled);
      if (range) return { abc: abc, error: range };
    } else if (op === "duration") {
      if (ev.kind === "zrest") return { abc: abc, error: m('jpErrWholeRestDuration') };
      const factor = command.factor;
      breakTies(events, index);
      if (factor === 0.5) {
        const half = ev.units / 2;
        if (!checkUnits(half) || !checkUnits(ev.units - half)) {
          return { abc: abc, error: m('jpErrDuration') };
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
          return { abc: abc, error: m('jpErrDuration') };
        }
        const next = events[index + 1];
        if (!next || next.removed || next.line !== ev.line || next.barIndex !== ev.barIndex ||
            (next.kind !== "rest" && next.kind !== "zrest") || next.units < added) {
          return { abc: abc, error: m('jpErrBarOver') };
        }
        if (next.kind === "zrest") return { abc: abc, error: m('jpErrBarOver') };
        const left = next.units - added;
        if (left !== 0 && !checkUnits(left)) return { abc: abc, error: m('jpErrDuration') };
        ev.units = nextUnits;
        if (left === 0) next.removed = true;
        else next.units = left;
        lyricsDirty = true;
      } else {
        return { abc: abc, error: m('jpErrDuration') };
      }
      const problem = acceptBar(oldSum, barSum(events, ev), ev.perBar);
      if (problem) return { abc: abc, error: problem };
    } else if (op === "insert") {
      if (ev.kind === "zrest" && ev.bars !== 1) return { abc: abc, error: m('jpErrInsertSame') };
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
        if (!checkUnits(half)) return { abc: abc, error: m('jpErrInsertSame') };
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
          return { abc: abc, error: m('jpErrBarShort') };
        }
        const merged = prev.units + ev.units;
        if (!checkUnits(merged)) return { abc: abc, error: m('jpErrBarShort') };
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
      if (ev.kind !== "note") return { abc: abc, error: m('jpErrRestNoTie') };
      const next = events[index + 1];
      if (!samePitch(ev, next)) return { abc: abc, error: m('jpErrTieSame') };
      ev.tie = !ev.tie;
      next.continuesTie = ev.tie;
    } else if (op === "sustain") {
      if (ev.kind !== "note") return { abc: abc, error: m('jpErrRestNoSustain') };
      const added = quarterUnits(parsed.header.lDen);
      const nextUnits = ev.units + added;
      if (!added || !checkUnits(nextUnits)) return { abc: abc, error: m('jpErrDuration') };
      const next = events[index + 1];
      if (!next || next.removed || next.line !== ev.line || next.barIndex !== ev.barIndex || next.kind !== "rest") {
        return { abc: abc, error: m('jpErrNoRestAfter') };
      }
      if (next.units < added) return { abc: abc, error: m('jpErrRestTooShort') };
      const left = next.units - added;
      if (left !== 0 && !checkUnits(left)) return { abc: abc, error: m('jpErrDuration') };
      breakTies(events, index);
      ev.units = nextUnits;
      if (left === 0) next.removed = true;
      else next.units = left;
      lyricsDirty = true;
      const problem = acceptBar(oldSum, barSum(events, ev), ev.perBar);
      if (problem) return { abc: abc, error: problem };
    } else if (op === "lyric") {
      if (voice === "Ins") return { abc: abc, error: m('jpErrInsNoLyrics') };
      if (ev.kind !== "note") return { abc: abc, error: m('jpErrRestLyricStar') };
      const text = String(command.text == null ? "" : command.text).trim();
      ev.lyric = text && text !== "*" ? text : "*";
      lyricsDirty = true;
    } else if (op === "lyric-line") {
      if (voice === "Ins") return { abc: abc, error: m('jpErrInsNoLyrics') };
      const lineNo = ev.line;
      const notes = events.filter((item) => !item.removed && item.line === lineNo && item.kind === "note");
      if (!notes.length) return { abc: abc, error: m('jpErrNoLyricNotes') };
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
      return { abc: abc, error: m('jpErrUnsupported') };
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

  function tonicPc(key) {
    const acc = key.acc === "#" ? 1 : key.acc === "b" ? -1 : 0;
    return (NATURAL[key.step] + acc + 12) % 12;
  }

  // Chord quotes only. K: and notes stay, so jianpu degrees do not move.
  function chordsInKey(abc, targetName) {
    const src = String(abc || "");
    const name = String(targetName || "").trim();
    if (!name || !knownKey(name)) return src;
    const header = parseHeader(src.split(/\r?\n/));
    const target = keyFromName(name);
    if (target.name !== name || header.key.name.endsWith("m") !== name.endsWith("m")) return src;
    const step = (tonicPc(target) - tonicPc(header.key) + 12) % 12;
    const flats = target.fifths < 0;
    if (!step && flats === (header.key.fifths < 0)) return src;
    const names = flats ? PITCH_FLAT : PITCH_SHARP;
    const shift = step;
    return src.replace(/"([^"\n]*)"/g, (full, inner) => {
      const match = CHORD_RE.exec(String(inner || "").trim());
      if (!match) return full;
      const root = pitchClass(match[1]);
      if (root == null) return full;
      let out = names[(root + shift) % 12] + (match[2] || "");
      if (match[3]) {
        const bass = pitchClass(match[3]);
        if (bass == null) return full;
        out += "/" + names[(bass + shift) % 12];
      }
      return '"' + out + '"';
    });
  }

  function signatureNames(key) {
    return String(key.name).endsWith("m") ? SIGNATURE_MINOR : SIGNATURE_MAJOR;
  }

  function chordKeyNames(keyName) {
    const key = keyFromName(keyName);
    if (!knownKey(key.name)) return [];
    return signatureNames(key).slice();
  }

  function chosenChordKey(originalName) {
    const chosen = ui.chordKey;
    if (!chosen || !knownKey(chosen) || chosen.endsWith("m") !== originalName.endsWith("m")) return originalName;
    return chosen;
  }

  // Frets that raise shapes in the selected key up to the original sounding key. 0 means no capo.
  function capoFret(originalName, selectedName) {
    const original = keyFromName(originalName);
    const selected = keyFromName(selectedName);
    if (!knownKey(original.name) || !knownKey(selected.name)) return null;
    if (original.name.endsWith("m") !== selected.name.endsWith("m")) return null;
    return (tonicPc(original) - tonicPc(selected) + 12) % 12;
  }

  function keyLegend(originalName, selectedName) {
    const fret = capoFret(originalName, selectedName);
    if (fret == null) return "";
    return m("jpLeadKey") + " " + jianpuKeyLabel(keyFromName(selectedName))
      + "  " + m("jpCapoAt", { n: fret })
      + "  " + m("jpOriginalKey") + " " + jianpuKeyLabel(keyFromName(originalName));
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
    if (kIdx < 0) return { error: m('jpErrBadHeader'), header: header, lines: lines, items: [] };
    let key = header.key;
    let meter = header.meter.slice();
    let perBar = perBarUnits(meter, header.lDen);
    const items = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^M:\s*\d/.test(line)) {
        const meterMatch = /^M:\s*(\d+)\s*\/\s*(\d+)/.exec(line);
        if (meterMatch) {
          meter = [Number(meterMatch[1]), Number(meterMatch[2])];
          perBar = perBarUnits(meter, header.lDen);
        }
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
      const vLine = i;
      i += 1;
      while (i < lines.length && /^(M:|K:)/.test(lines[i])) {
        if (lines[i].startsWith("M:")) {
          const meterMatch = /^M:\s*(\d+)\s*\/\s*(\d+)/.exec(lines[i]);
          if (meterMatch) {
            meter = [Number(meterMatch[1]), Number(meterMatch[2])];
            perBar = perBarUnits(meter, header.lDen);
          }
        } else {
          key = keyFromName(lines[i].slice(2));
        }
        i += 1;
      }
      if (i >= lines.length) break;
      const musicLine = i;
      const scanned = scanMusic(lines[i], key, perBar);
      if (scanned.error) return { error: scanned.error, header: header, lines: lines, items: [] };
      key = scanned.key;
      i += 1;
      let lyricLine = -1;
      let wLine = null;
      if (voice === "Vocal" && i < lines.length && /^w:/.test(lines[i])) {
        lyricLine = i;
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
      items.push({
        type: "music",
        voice: voice,
        events: scanned.events,
        startKey: startKey,
        meter: meter.slice(),
        vLine: vLine,
        musicLine: musicLine,
        lyricLine: lyricLine,
      });
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
    let line = MARK_LYRIC;
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
    if (!beat) return { text: "", error: m('jpErrBadUnit'), marks: [] };
    const header = walked.header;
    let text = jianpuKeyLabel(header.key) + "  " + header.meter[0] + "/" + header.meter[1] + "  ♩=" + header.bpm;
    const marks = [];
    let shownMeter = header.meter;
    for (const item of walked.items) {
      if (item.type === "comment") {
        text += "\n" + item.text;
        continue;
      }
      if (item.meter && (item.meter[0] !== shownMeter[0] || item.meter[1] !== shownMeter[1])) {
        text += "\n" + item.meter[0] + "/" + item.meter[1];
        shownMeter = item.meter;
      }
      text += "\n" + voiceMark(item.voice);
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
        if (!dur) return { error: m('jpErrDurToText') };
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
        if (!written) return { error: m('jpErrNoteToText') };
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

  function parseTitle(abc) {
    // Keep the match on one line: \s would eat the newline after a blank T:.
    const match = /^T:[ \t]*(.*)$/m.exec(String(abc || ""));
    return match ? String(match[1] || "").trim() : "";
  }

  /** Library song name when the score keeps a blank T: (YuE2 dialect). */
  function displayTitle(abc, fallback) {
    return parseTitle(abc) || String(fallback || "").trim();
  }

  /** Fill a blank T: for engraving / print only; does not mutate the stored score. */
  function withDisplayTitle(abc, fallback) {
    const src = String(abc || "");
    const title = String(fallback || "").trim();
    if (!title || parseTitle(src)) return src;
    return src.replace(/^T:[ \t]*$/m, "T:" + title);
  }

  // Second T: is the engraving subtitle only. The stored score is unchanged.
  function withKeyLegend(abc, legend) {
    const src = String(abc || "");
    const line = String(legend || "").trim();
    if (!line) return src;
    if (/^T:/m.test(src)) return src.replace(/^T:[^\n]*/m, (title) => title + "\nT:" + line);
    return "T:\nT:" + line + "\n" + src;
  }

  // Guitar shape key for %%diagram 6, same spelling rules as diag-1.js.
  function resolveGuitarShape(symbol) {
    const raw = String(symbol || "").trim();
    const empty = { symbol: raw, shapeKey: "", frets: "" };
    if (!raw) return empty;
    const table = typeof abc2svg !== "undefined" && abc2svg.diag && abc2svg.diag.cd6;
    let t = raw.replace(/<[^>]*>/g, "");
    const parts = t.match(/([A-G][#♯b♭]?)([^/]*)\/?/);
    if (parts && parts[2] && typeof abc2svg !== "undefined" && abc2svg.ch_alias) {
      const aliased = abc2svg.ch_alias[parts[2]];
      if (aliased != null) t = t.replace(parts[2], aliased);
    }
    t = t.replace("/", ".").replace(/\u266f/g, "#").replace(/\u266d/g, "b");
    const roots = {
      Bb: "A#", Eb: "D#", Ab: "G#", Db: "C#", Gb: "F#",
      Cb: "B", Fb: "E", "E#": "F", "B#": "C",
    };
    const rootMatch = /^([A-G](?:#|b)?)(.*)$/.exec(t);
    let spelled = t;
    if (rootMatch && roots[rootMatch[1]] != null) {
      spelled = roots[rootMatch[1]] + rootMatch[2];
    }
    spelled = spelled.replace(/m\+7/g, "m(maj7)");
    if (!table) return { symbol: raw, shapeKey: spelled, frets: "" };
    if (table[spelled]) return { symbol: raw, shapeKey: spelled, frets: table[spelled] };
    const root = spelled.split(".")[0];
    if (root && table[root]) return { symbol: raw, shapeKey: root, frets: table[root] };
    return { symbol: raw, shapeKey: "", frets: "" };
  }

  function guitarDiagramSvg(frets) {
    const n = 6;
    const d = String(frets || "").split(" ");
    if (d.length < 3) return "";
    const x0 = 2 - 2 * n;
    let dc = '<path stroke="currentColor" fill="none" stroke-width="0.8" d="M-10 -24h20m0 6h-20m0 6h20m0 6h-20m0 6h20"/>'
      + '<path stroke="currentColor" fill="none" stroke-width="0.8" d="M-10 -24v24m4 0v-24m4 0v24m4 0v-24m4 0v24m4 0v-24"/>';
    const l = d[1].split(",");
    if (!l[0] || l[0].slice(-1) == l[1]) {
      dc += '<path stroke="currentColor" fill="none" stroke-width="1.6" d="M-10.2 -24.5h20.4"/>';
    }
    if (l[0]) {
      dc += '<text x="' + (x0 - 10) + '" y="' + ((l[1] || 1) * 6 - 25)
        + '" font-size="7" font-style="italic" fill="currentColor">' + l[0] + "</text>";
    }
    dc += '<text x="-12,-8,-4,0,4,8" y="-26" font-size="6" fill="currentColor">'
      + d[2].replace(/[y0]/g, "\u00a0") + "</text>";
    for (let i = 0; i < n; i++) {
      const f = d[0][i];
      if (f && f !== "x" && f !== "0") {
        dc += '<circle fill="currentColor" cx="' + (i * 4 + x0) + '" cy="' + (f * 6 - 27) + '" r="1.5"/>';
      }
    }
    if (d[3]) {
      const barre = d[3].match(/barre=(\d)-(\d)/);
      if (barre) {
        dc += '<path stroke="currentColor" fill="none" stroke-width="1.4" d="M'
          + ((n - Number(barre[1])) * 4 + x0 - 2) + " -21h"
          + ((Number(barre[1]) - Number(barre[2])) * 4 + 4) + '"/>';
      }
    }
    return '<svg class="yue-jp-lead-diag" viewBox="-22 -36 44 44" width="56" height="56" aria-hidden="true">'
      + dc + "</svg>";
  }

  function rememberChord(order, seen, symbol) {
    const name = String(symbol || "").trim();
    if (!name || !spellChord(name) || seen.has(name)) return;
    seen.add(name);
    order.push(resolveGuitarShape(name));
  }

  function leadLyricCells(events) {
    const cells = [];
    let pending = "";
    for (const ev of events) {
      if (ev.chord) pending = ev.chord;
      if (ev.kind !== "note") continue;
      if (!lyricIsDrawn(ev.lyric)) continue;
      cells.push({ text: displayLyricToken(ev.lyric), chord: pending || "" });
      pending = "";
    }
    return cells;
  }

  function leadBeatCells(events, beat, perBar) {
    if (!beat || !perBar) return [];
    const bars = layoutBars(events);
    const cells = [];
    for (let b = 0; b < bars.length; b++) {
      if (b) cells.push({ text: "|", chord: "", bar: true });
      let units = 0;
      const onBeat = {};
      for (const ev of bars[b]) {
        if (ev.chord) {
          const at = Math.floor(units / beat);
          if (onBeat[at] == null) onBeat[at] = ev.chord;
        }
        units += ev.units;
      }
      const beats = Math.max(1, Math.round((units || perBar) / beat));
      for (let i = 0; i < beats; i++) {
        cells.push({ text: "-", chord: onBeat[i] || "", bar: false });
      }
    }
    return cells;
  }

  /**
   * Lyrics + chords only: sections from % comments, syllable or beat rows,
   * and guitar shapes for the chords that appear (order of first use).
   */
  function leadSheet(abc, fallbackTitle, keyName) {
    const songTitle = fallbackTitle != null ? String(fallbackTitle).trim() : (ui.songTitle || "");
    const sourceHeader = parseHeader(String(abc || "").split(/\r?\n/));
    const pickedName = String(keyName || "").trim();
    const picked = pickedName && knownKey(pickedName) ? keyFromName(pickedName) : null;
    const sameMode = !!(picked && sourceHeader.key.name.endsWith("m") === picked.name.endsWith("m"));
    const selected = sameMode ? picked : sourceHeader.key;
    const view = sameMode ? chordsInKey(abc, picked.name) : String(abc || "");
    const walked = walkBody(view);
    const header = walked.header || sourceHeader;
    const fret = capoFret(sourceHeader.key.name, selected.name);
    const empty = {
      error: walked.error || null,
      title: displayTitle(abc, songTitle),
      meter: header.meter[0] + "/" + header.meter[1],
      bpm: header.bpm,
      keyLabel: jianpuKeyLabel(selected),
      originalKeyLabel: jianpuKeyLabel(sourceHeader.key),
      capoFret: fret,
      chords: [],
      sections: [],
    };
    if (walked.error) return empty;
    const beat = quarterUnits(header.lDen);
    const perBar = perBarUnits(header.meter, header.lDen);
    if (!beat || !perBar) {
      empty.error = m("jpErrBadUnit");
      return empty;
    }
    const chordOrder = [];
    const chordSeen = new Set();
    const sections = [];
    let current = { label: "", lines: [] };
    function flush() {
      if (current.lines.length || current.label) sections.push(current);
      current = { label: "", lines: [] };
    }
    for (const item of walked.items) {
      if (item.type === "comment") {
        const label = String(item.text || "").replace(/^%\s*/, "").trim();
        if (!current.lines.length) current.label = label;
        else {
          flush();
          current.label = label;
        }
        continue;
      }
      if (item.voice !== "Vocal") continue;
      for (const ev of item.events) {
        if (ev.chord) rememberChord(chordOrder, chordSeen, ev.chord);
      }
      const lyric = formatLyric(item.events);
      if (lyric.line) {
        const cells = leadLyricCells(item.events);
        if (cells.length) current.lines.push({ kind: "lyrics", cells: cells });
      } else {
        const cells = leadBeatCells(item.events, beat, perBar);
        if (cells.length) current.lines.push({ kind: "beats", cells: cells });
      }
    }
    flush();
    return {
      error: null,
      title: displayTitle(abc, songTitle),
      meter: header.meter[0] + "/" + header.meter[1],
      bpm: header.bpm,
      keyLabel: jianpuKeyLabel(selected),
      originalKeyLabel: jianpuKeyLabel(sourceHeader.key),
      capoFret: fret,
      chords: chordOrder,
      sections: sections,
    };
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
        if (end < 0) return { error: m('jpErrChordOpen') };
        items.push({ kind: "chord", text: line.slice(i + 1, end), start: i, end: end + 1 });
        i = end + 1;
        continue;
      }
      if (line.startsWith("[K:", i)) {
        const end = line.indexOf("]", i);
        if (end < 0) return { error: m('jpErrKeyOpen') };
        items.push({ kind: "key", text: line.slice(i + 3, end).trim(), start: i, end: end + 1 });
        i = end + 1;
        continue;
      }
      const match = TEXT_NOTE.exec(line.slice(i));
      if (!match) {
        let j = i;
        while (j < line.length && !/[\s|]/.test(line[j])) j += 1;
        return { error: m('jpErrToken', { token: line.slice(i, j) }) };
      }
      const oct = match[3] || "";
      if (oct.indexOf("'") >= 0 && oct.indexOf(",") >= 0) return { error: m('jpErrTokenOctave') };
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
    if (base == null) return { error: m('jpErrDuration') };
    if (item.degree === 0) {
      if (item.acc) return { error: m('jpErrRestNoAccidental') };
      if (item.oct) return { error: m('jpErrRestNoOctave') };
      if (item.tie) return { error: m('jpErrRestNoTie') };
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
    if (!spelled) return { error: m('jpErrOutOfRange') };
    const midi = midiNumber(spelled.letter, spelled.marks, spelled.acc, key, null);
    if (midi < 0 || midi > 127) return { error: m('jpErrOutOfRange') };
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

  function parseMusicLine(raw, lineStart, beat, startKey, lineNo) {
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
          return { error: any ? m('jpErrSustainCross') : m('jpErrSustainNoNote') };
        }
        current.units += beat;
        current.markEnd = lineStart + item.end;
        continue;
      }
      if (item.kind === "chord") {
        closeNote();
        if (!CHORD_RE.test(item.text)) return { error: m('jpErrBadChord') };
        pendingChord = item.text;
        pendingStart = item.start;
        continue;
      }
      if (item.kind === "key") {
        closeNote();
        const next = keyFromName(item.text);
        if (!knownKey(next.name)) return { error: m('jpErrBadKeyChange') };
        key = next;
        continue;
      }
      closeNote();
      const built = buildTextNote(item, key, beat, pendingChord);
      if (built.error) return built;
      built.event.token = raw.slice(item.start, item.end);
      built.event.markStart = lineStart + (pendingStart == null ? item.start : pendingStart);
      built.event.markEnd = lineStart + item.end;
      current = built.event;
      pendingChord = "";
      pendingStart = null;
    }
    closeNote();
    while (bars.length && !bars[0].length) bars.shift();
    while (bars.length && !bars[bars.length - 1].length) bars.pop();
    if (!bars.length) return { error: m('jpErrNoNotes') };
    for (let b = 0; b < bars.length; b++) {
      for (const ev of bars[b]) {
        ev.lineNo = lineNo;
        ev.barNo = b + 1;
      }
    }
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

  function textWarnings(items, lDen) {
    const warnings = [];
    function push(message) {
      if (warnings.indexOf(message) < 0) warnings.push(message);
    }
    let music = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type !== "comment") continue;
      let j = i + 1;
      while (j < items.length && items[j].type === "comment") j += 1;
      if (j >= items.length || items[j].type !== "music") push(m('jpErrSectionEmpty'));
    }
    function checkLine(item) {
      if (!item) return;
      const barUnits = perBarUnits(item.meter || [4, 4], lDen);
      if (item.bars.length < 1 || item.bars.length > barsPerLine.max) {
        push(m('jpErrMaxBars', { max: barsPerLine.max }));
      }
      for (const bar of item.bars) {
        if (!bar.length) {
          push(m('jpErrEmptyBar'));
          continue;
        }
        let units = 0;
        for (const ev of bar) {
          units += ev.units;
          if (!DURATIONS.has(ev.units)) push(m('jpErrDuration'));
          if (item.voice === "Ins" && ev.chord) push(m('jpErrChordOnIns'));
        }
        if (units !== barUnits) push(m('jpErrVoiceBarBeats', { voice: voiceMark(item.voice) }));
      }
    }
    function checkTies(events, voice) {
      for (let i = 0; i < events.length; i++) {
        if (!events[i].tie) continue;
        const next = events[i + 1];
        if (sameWritten(events[i], next)) continue;
        const place = {
          line: events[i].lineNo,
          voice: voice,
          bar: events[i].barNo,
          note: events[i].token || "",
        };
        push(next
          ? m('jpErrTieSameAt', Object.assign({ next: next.token || "" }, place))
          : m('jpErrTieSameEnd', place));
      }
    }
    const vocalEvents = [];
    const insEvents = [];
    for (const group of groupMusic(items)) {
      if (group.comment) continue;
      music += 1;
      checkLine(group.vocal);
      checkLine(group.ins);
      if (!group.vocal || !group.ins) push(m('jpErrVoicesBars'));
      else if (group.vocal.bars.length !== group.ins.bars.length) push(m('jpErrVoicesBars'));
      else {
        for (let b = 0; b < group.vocal.bars.length; b++) {
          const left = group.vocal.bars[b][0];
          const right = group.ins.bars[b][0];
          if (left && right && left.key.name !== right.key.name) push(m('jpErrVoicesKey'));
        }
      }
      for (const ev of flattenBars(group.vocal)) vocalEvents.push(ev);
      for (const ev of flattenBars(group.ins)) insEvents.push(ev);
    }
    if (!music) push(m('jpErrNeedVoices'));
    checkTies(vocalEvents, MARK_VOCAL);
    checkTies(insEvents, MARK_INS);
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

  function bodyFromText(items, keyName, headerMeter) {
    const lines = [];
    const running = { meter: headerMeter.slice() };
    function changed(item) {
      const next = item && item.meter;
      return !!(next && (next[0] !== running.meter[0] || next[1] !== running.meter[1]));
    }
    for (const group of groupMusic(items)) {
      if (group.comment) {
        lines.push(group.comment);
        continue;
      }
      const shift = changed(group.vocal) || changed(group.ins);
      if (group.vocal) {
        const state = { key: keyName };
        lines.push("V: Vocal");
        if (shift) lines.push("M:" + group.vocal.meter[0] + "/" + group.vocal.meter[1]);
        lines.push(group.vocal.bars.map((bar) => bar.map((ev) => abcPiece(ev, state)).join(" ")).join(" | ") + "|");
        const lyric = lyricAbc(group.vocal);
        if (lyric) lines.push(lyric);
      }
      if (group.ins) {
        const state = { key: keyName };
        lines.push("V: Ins");
        if (shift) lines.push("M:" + group.ins.meter[0] + "/" + group.ins.meter[1]);
        lines.push(group.ins.bars.map((bar) => bar.map((ev) => abcPiece(ev, state)).join(" ")).join(" | ") + "|");
      }
      const sample = group.vocal || group.ins;
      if (shift && sample.meter) running.meter = sample.meter.slice();
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

  function textFail(detail, line) {
    return { abc: null, error: detail, warning: null, note: null, marks: [], line: line || 0 };
  }

  function parseJianpuText(text, baseAbc) {
    const base = String(baseAbc || "");
    const baseLines = base.split(/\r?\n/);
    const headerEnd = baseLines.findIndex((line) => /^K:\s*/.test(line));
    if (headerEnd < 0) return { abc: null, error: m('jpErrBadHeader'), warning: null, note: null, marks: [] };
    const baseHeader = parseHeader(baseLines);
    const beat = quarterUnits(baseHeader.lDen);
    if (!beat) return { abc: null, error: m('jpErrBadUnit'), warning: null, note: null, marks: [] };
    let meter = baseHeader.meter.slice();
    let headerMeter = meter.slice();
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
          return textFail(m('jpErrLine', { line: li + 1, detail: m('jpErrBadKey') }), li + 1);
        }
        const nextMeter = [Number(match[3]), Number(match[4])];
        const per = perBarUnits(nextMeter, baseHeader.lDen);
        if (!nextMeter[0] || !nextMeter[1] || !Number.isInteger(per) || per <= 0 || (nextMeter[1] & (nextMeter[1] - 1)) !== 0) {
          return textFail(m('jpErrLine', { line: li + 1, detail: m('jpErrBadMeter') }), li + 1);
        }
        const tempo = Number(match[5]);
        if (!tempo) return textFail(m('jpErrLine', { line: li + 1, detail: m('jpErrTempoInt') }), li + 1);
        meter = nextMeter;
        headerMeter = meter.slice();
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
      const meterOnly = /^(\d+)\s*\/\s*(\d+)$/.exec(trim);
      if (meterOnly) {
        const nextMeter = [Number(meterOnly[1]), Number(meterOnly[2])];
        const per = perBarUnits(nextMeter, baseHeader.lDen);
        if (!nextMeter[0] || !nextMeter[1] || !Number.isInteger(per) || per <= 0 || (nextMeter[1] & (nextMeter[1] - 1)) !== 0) {
          return textFail(m('jpErrLine', { line: li + 1, detail: m('jpErrBadMeter') }), li + 1);
        }
        meter = nextMeter;
        sawContent = true;
        continue;
      }
      const markedVoice = voiceOfMark(trim);
      if (markedVoice) {
        voice = markedVoice;
        continue;
      }
      if (lyricPrefix(trim)) {
        if (voice === "Ins") {
          return textFail(m('jpErrLine', { line: li + 1, detail: m('jpErrLineInsLyrics') }), li + 1);
        }
        let vocalItem = null;
        for (let prev = items.length - 1; prev >= 0; prev--) {
          if (items[prev].type === "music" && items[prev].voice === "Vocal") {
            vocalItem = items[prev];
            break;
          }
        }
        if (!vocalItem) {
          return textFail(m('jpErrLine', { line: li + 1, detail: m('jpErrLineLyricNoVocal') }), li + 1);
        }
        if (vocalItem.lyricSet) {
          return textFail(m('jpErrLine', { line: li + 1, detail: m('jpErrLineHasLyric') }), li + 1);
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
        if (extra && !note) note = m('jpLeftoverSyllables', { count: extra });
        vocalItem.lyricSet = true;
        continue;
      }
      if (!voice) {
        return textFail(m('jpErrLine', { line: li + 1, detail: m('jpErrUnderVoice') }), li + 1);
      }
      const parsed = parseMusicLine(raw, starts[li], beat, key, li + 1);
      if (parsed.error) {
        return textFail(m('jpErrLine', { line: li + 1, detail: parsed.error }), li + 1);
      }
      items.push({ type: "music", voice: voice, bars: parsed.bars, lyricSet: false, meter: meter.slice() });
    }
    const warnings = textWarnings(items, baseHeader.lDen);
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
    const header = applyTextHeader(baseLines, headerEnd, headerMeter, bpm, key.name);
    let abc = header.concat(bodyFromText(items, key.name, headerMeter)).join("\n");
    if (base.endsWith("\n")) abc += "\n";
    return { abc: abc, error: null, warning: warnings[0] || null, note: note, marks: marks };
  }

  // Syllables that fill a note when realigning. Empty · / * do not consume a slot.
  function alignPoolToken(token) {
    const text = String(token == null ? "" : token).trim();
    if (!text || text === "*" || text === "·") return null;
    if (text === "-") return "-";
    return text.replace(/[|\s]/g, "") || null;
  }

  function alignFrozenToken(token) {
    const text = String(token == null ? "" : token).trim();
    if (!text || text === "·") return "*";
    if (text === "-") return "-";
    if (text === "*") return "*";
    return text.replace(/[|\s]/g, "") || "*";
  }

  function collectLyricExtras(source, marks, slotByIndex) {
    const lines = String(source || "").split("\n");
    const starts = [];
    let cursor = 0;
    for (let i = 0; i < lines.length; i++) {
      starts.push(cursor);
      cursor += lines[i].length + 1;
    }
    const musicMarks = (marks || []).filter((mark) => mark.kind !== "lyric" && mark.voice === "Vocal");
    const extras = [];
    let voice = null;
    let pendingNotes = 0;
    let pendingLastIndex = -1;
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li];
      const trim = raw.trim();
      if (!trim) continue;
      if (/^[1-7]=/.test(trim) || /^%/.test(trim) || /^\d+\s*\/\s*\d+$/.test(trim)) {
        voice = null;
        continue;
      }
      const markedVoice = voiceOfMark(trim);
      if (markedVoice) {
        voice = markedVoice;
        continue;
      }
      if (lyricPrefix(trim)) {
        const spans = lyricLineSpans(raw);
        for (let n = pendingNotes; n < spans.length; n++) {
          extras.push({
            token: spans[n].token,
            start: starts[li] + spans[n].start,
            end: starts[li] + spans[n].end,
            afterIndex: pendingLastIndex,
          });
        }
        continue;
      }
      if (voice !== "Vocal") continue;
      const lineStart = starts[li];
      const lineEnd = lineStart + raw.length;
      const noteMarks = musicMarks
        .filter((mark) => mark.start >= lineStart && mark.start < lineEnd && slotByIndex.has(mark.index))
        .sort((a, b) => a.index - b.index);
      pendingNotes = noteMarks.length;
      if (noteMarks.length) pendingLastIndex = noteMarks[noteMarks.length - 1].index;
    }
    return extras;
  }

  function lyricAlignStream(slots, extras) {
    const stream = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.start == null || slot.end == null) continue;
      stream.push({
        start: slot.start,
        end: slot.end,
        token: slot.token,
        slot: i,
        id: "s" + i,
      });
    }
    (extras || []).forEach((extra, ei) => {
      stream.push({
        start: extra.start,
        end: extra.end,
        token: extra.token,
        slot: null,
        afterIndex: extra.afterIndex,
        id: "e" + ei,
      });
    });
    stream.sort((a, b) => a.start - b.start || a.end - b.end);
    return stream;
  }

  function slotAtOrAfterEvent(eventIndex, slots, events, slotByIndex) {
    const eventByIndex = new Map((events || []).map((ev) => [ev.index, ev]));
    const ev = eventByIndex.get(eventIndex);
    if (ev && ev.kind === "note" && slotByIndex.has(eventIndex)) return slotByIndex.get(eventIndex);
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].index > eventIndex) return i;
    }
    return slots.length;
  }

  function decideAlignFreeze(caretAt, slots, extras, marks, events, source, slotByIndex) {
    const stream = lyricAlignStream(slots, extras);
    const empty = {
      freezeSlot: slots.length,
      override: null,
      poolPrefix: [],
      anchor: caretAt,
      skipId: null,
      musicMarkStart: null,
    };
    for (const item of stream) {
      if (caretAt > item.start && caretAt < item.end) {
        const left = alignFrozenToken(source.slice(item.start, caretAt));
        const right = alignPoolToken(source.slice(caretAt, item.end));
        if (item.slot != null) {
          return {
            freezeSlot: item.slot + 1,
            override: { slot: item.slot, token: left },
            poolPrefix: right ? [right] : [],
            anchor: caretAt,
            skipId: item.id,
            musicMarkStart: null,
          };
        }
        const afterSlot = slotByIndex.has(item.afterIndex) ? slotByIndex.get(item.afterIndex) + 1 : slots.length;
        return {
          freezeSlot: afterSlot,
          override: null,
          poolPrefix: right ? [right] : [],
          anchor: caretAt,
          skipId: item.id,
          musicMarkStart: null,
        };
      }
      if (caretAt === item.start) {
        if (item.slot != null) {
          return {
            freezeSlot: item.slot,
            override: null,
            poolPrefix: [],
            anchor: caretAt,
            skipId: null,
            musicMarkStart: null,
          };
        }
        return {
          freezeSlot: slotByIndex.has(item.afterIndex) ? slotByIndex.get(item.afterIndex) + 1 : slots.length,
          override: null,
          poolPrefix: [],
          anchor: caretAt,
          skipId: null,
          musicMarkStart: null,
        };
      }
    }
    // Caret on a music glyph in the text score.
    for (const mark of marks || []) {
      if (mark.kind === "lyric") continue;
      if (!(caretAt >= mark.start && caretAt < mark.end)) continue;
      if (mark.voice === "Vocal") {
        const freezeSlot = slotAtOrAfterEvent(mark.index, slots, events, slotByIndex);
        return {
          freezeSlot: freezeSlot,
          override: null,
          poolPrefix: [],
          anchor: mark.start,
          skipId: null,
          musicMarkStart: mark.start,
        };
      }
      const vocal = (marks || [])
        .filter((item) => item.kind !== "lyric" && item.voice === "Vocal" && item.start >= mark.end)
        .sort((a, b) => a.start - b.start || a.index - b.index);
      if (!vocal.length) return empty;
      const next = vocal[0];
      const freezeSlot = slotAtOrAfterEvent(next.index, slots, events, slotByIndex);
      return {
        freezeSlot: freezeSlot,
        override: null,
        poolPrefix: [],
        anchor: next.start,
        skipId: null,
        musicMarkStart: next.start,
      };
    }
    // Between syllables (or after the last frozen one): next lyric piece wins
    // over a later music line further down the page.
    for (const item of stream) {
      if (item.start < caretAt) continue;
      if (item.slot != null) {
        return {
          freezeSlot: item.slot,
          override: null,
          poolPrefix: [],
          anchor: caretAt,
          skipId: null,
          musicMarkStart: null,
        };
      }
      return {
        freezeSlot: slotByIndex.has(item.afterIndex) ? slotByIndex.get(item.afterIndex) + 1 : slots.length,
        override: null,
        poolPrefix: [],
        anchor: caretAt,
        skipId: null,
        musicMarkStart: null,
      };
    }
    const vocalMarks = (marks || [])
      .filter((mark) => mark.kind !== "lyric" && mark.voice === "Vocal")
      .slice()
      .sort((a, b) => a.start - b.start || a.index - b.index);
    for (const mark of vocalMarks) {
      if (mark.start < caretAt) continue;
      const freezeSlot = slotAtOrAfterEvent(mark.index, slots, events, slotByIndex);
      return {
        freezeSlot: freezeSlot,
        override: null,
        poolPrefix: [],
        anchor: mark.start,
        skipId: null,
        musicMarkStart: mark.start,
      };
    }
    return empty;
  }

  function collectAlignPool(stream, decision, slots) {
    const pool = decision.poolPrefix.slice();
    const freezeSlot = decision.freezeSlot;
    let anchor = decision.anchor;
    if (decision.musicMarkStart != null) {
      const slot = slots[freezeSlot];
      if (slot && slot.start != null) anchor = slot.start;
      else anchor = decision.musicMarkStart;
    }
    for (const item of stream) {
      if (decision.skipId && item.id === decision.skipId) continue;
      if (item.slot != null) {
        if (item.slot < freezeSlot) continue;
        const token = alignPoolToken(item.token);
        if (token) pool.push(token);
        continue;
      }
      if (item.start < anchor) continue;
      const token = alignPoolToken(item.token);
      if (token) pool.push(token);
    }
    // Notes with no lyric mark still keep non-empty tokens from ABC (rare).
    for (let i = freezeSlot; i < slots.length; i++) {
      if (slots[i].start != null) continue;
      const token = alignPoolToken(slots[i].token);
      if (token) pool.push(token);
    }
    return pool;
  }

  /// Align syllables after `caret` onto the following vocal notes, one per note.
  function alignLyricsAfter(text, baseAbc, caret) {
    const parsed = parseJianpuText(text, baseAbc);
    const caretAt = Math.max(0, Number(caret) || 0);
    if (!parsed.abc) {
      return {
        text: null,
        abc: null,
        error: parsed.error || m("jpFixTextFirst"),
        none: false,
        caret: caretAt,
        leftover: 0,
      };
    }
    const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const clamped = Math.max(0, Math.min(caretAt, source.length));
    const collected = collect(parsed.abc);
    if (collected.error) {
      return {
        text: null,
        abc: null,
        error: collected.error,
        none: false,
        caret: clamped,
        leftover: 0,
      };
    }
    const noteEvents = collected.events.filter((ev) => ev.kind === "note");
    const slots = noteEvents.map((ev) => ({
      index: ev.index,
      token: String(ev.lyric == null ? "*" : ev.lyric).trim() || "*",
      start: null,
      end: null,
    }));
    const slotByIndex = new Map();
    slots.forEach((slot, i) => slotByIndex.set(slot.index, i));
    for (const mark of parsed.marks || []) {
      if (mark.kind !== "lyric") continue;
      const si = slotByIndex.get(mark.index);
      if (si == null) continue;
      slots[si].start = mark.start;
      slots[si].end = mark.end;
      const raw = source.slice(mark.start, mark.end);
      slots[si].token = raw === "·" ? "*" : alignFrozenToken(raw);
    }
    const extras = collectLyricExtras(source, parsed.marks || [], slotByIndex);
    const stream = lyricAlignStream(slots, extras);
    const decision = decideAlignFreeze(
      clamped, slots, extras, parsed.marks || [], collected.events, source, slotByIndex);
    const freezeSlot = decision.freezeSlot;
    const pool = collectAlignPool(stream, decision, slots);
    if (freezeSlot >= slots.length && !pool.length) {
      return {
        text: source,
        abc: parsed.abc,
        error: null,
        none: true,
        caret: clamped,
        leftover: 0,
      };
    }
    const newLyrics = slots.map((slot) => slot.token);
    if (decision.override) newLyrics[decision.override.slot] = decision.override.token;
    let poolAt = 0;
    for (let i = freezeSlot; i < slots.length; i++) {
      newLyrics[i] = poolAt < pool.length ? pool[poolAt++] : "*";
    }
    const leftover = Math.max(0, pool.length - poolAt);
    let changed = leftover > 0;
    for (let i = 0; i < slots.length; i++) {
      if (newLyrics[i] !== slots[i].token) changed = true;
    }
    if (decision.override && decision.override.token !== slots[decision.override.slot].token) changed = true;
    if (!changed) {
      return {
        text: source,
        abc: parsed.abc,
        error: null,
        none: true,
        caret: clamped,
        leftover: 0,
      };
    }
    for (const ev of collected.events) {
      if (ev.kind !== "note") continue;
      const si = slotByIndex.get(ev.index);
      if (si == null) continue;
      ev.lyric = newLyrics[si];
    }
    const lines = collected.lines.slice();
    rewriteLyrics(lines, collected.events);
    const abc = joinAbc(lines, parsed.abc);
    const built = buildJianpuText(abc);
    if (built.error) {
      return {
        text: null,
        abc: null,
        error: built.error,
        none: false,
        caret: clamped,
        leftover: 0,
      };
    }
    let newCaret = 0;
    const builtMarks = built.marks || [];
    if (freezeSlot > 0) {
      const frozenIndex = slots[freezeSlot - 1].index;
      const mark = builtMarks.find((item) => item.kind === "lyric" && item.index === frozenIndex);
      newCaret = mark ? mark.end : 0;
    } else if (freezeSlot < slots.length) {
      const firstIndex = slots[freezeSlot].index;
      const mark = builtMarks.find((item) => item.kind === "lyric" && item.index === firstIndex);
      newCaret = mark ? mark.start : 0;
    } else {
      newCaret = (built.text || "").length;
    }
    return {
      text: built.text || "",
      abc: abc,
      error: null,
      none: false,
      caret: newCaret,
      leftover: leftover,
    };
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
    if (!beat) return { error: m('jpErrBadUnit') };
    const voices = { Vocal: [], Ins: [] };
    let voice = null;
    let saw = false;
    const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li];
      const trim = raw.trim();
      const fail = (detail) => ({ error: m('jpErrLine', { line: li + 1, detail: detail }) });
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
      if (/^\d+\s*\/\s*\d+$/.test(trim)) continue;
      const markedVoice = voiceOfMark(trim);
      if (markedVoice) {
        voice = markedVoice;
        continue;
      }
      if (lyricPrefix(trim)) continue;
      if (!voice) return fail(m('jpErrUnderVoice'));
      const scanned = scanTextTokens(raw);
      if (scanned.error) return fail(scanned.error);
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
          if (!current) return fail(m('jpErrSustainNoNote'));
          current.units += beat;
          continue;
        }
        flush();
        if (item.degree === 0 && (item.acc || item.oct || item.tie)) {
          return fail(m('jpErrRestNoAccidental'));
        }
        const units = unitsFromMarks(item.slashes, item.dotted, beat);
        if (units == null) return fail(m('jpErrDuration'));
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
    const name = voiceMark(voice);
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
        if (!head) fail(m('jpErrNoteMissing', { n: ordinal, want: want }));
        else if (!same) {
          fail(m('jpErrNoteMismatch', { n: ordinal, want: want, shown: printed }));
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
        fail(m('jpErrRestMismatch', { n: start, shown: describeShown(shown[j]) }));
        marks.push({ voice: voice, glyph: j });
        j += 1;
        continue;
      }
      fail(m('jpErrRestCount', { n: start, want: expanded, shown: zeros }));
      for (let n = 0; n < zeros; n++) marks.push({ voice: voice, glyph: j + n });
      j += zeros;
    }
    while (shown[j]) {
      fail(m('jpErrExtraGlyph', { shown: describeShown(shown[j]) }));
      marks.push({ voice: voice, glyph: j });
      j += 1;
    }
    return { message: message, marks: marks };
  }

  function compareJianpuNotes(text, svg, beat, lDen, perBar) {
    const written = writtenNotes(text, beat);
    if (written.error) {
      return { ok: false, unreadable: true, message: written.error, marks: [] };
    }
    const shown = shownNotes(svg);
    const vocal = alignVoice(written.voices.Vocal, shown.Vocal, "Vocal", lDen, perBar || 0);
    const ins = alignVoice(written.voices.Ins, shown.Ins, "Ins", lDen, perBar || 0);
    const marks = vocal.marks.concat(ins.marks);
    const message = vocal.message || ins.message;
    if (message) return { ok: false, unreadable: false, message: message, marks: marks };
    return { ok: true, unreadable: false, message: m('jpMatchOk'), marks: [] };
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

  // ponytail: one mirror pass per paint. Div wrap can drift a pixel from the textarea; switch the editor to per-line blocks if a row no longer sits on its number.
  function measureWrappedHeights(textarea, lines) {
    if (!textarea || typeof getComputedStyle !== "function" || !document.body) return null;
    const view = getComputedStyle(textarea);
    const padL = parseFloat(view.paddingLeft) || 0;
    const padR = parseFloat(view.paddingRight) || 0;
    const width = textarea.clientWidth - padL - padR;
    if (width < 8) return null;
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.position = "absolute";
    mirror.style.left = "-9999px";
    mirror.style.top = "0";
    mirror.style.visibility = "hidden";
    mirror.style.boxSizing = "content-box";
    mirror.style.width = width + "px";
    mirror.style.height = "auto";
    mirror.style.padding = "0";
    mirror.style.border = "0";
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const row = document.createElement("div");
      row.style.whiteSpace = "pre-wrap";
      row.style.overflowWrap = "break-word";
      row.style.wordWrap = "break-word";
      row.textContent = lines[i] ? lines[i] : "\u200b";
      mirror.appendChild(row);
      rows.push(row);
    }
    [
      "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
    ].forEach((name) => {
      mirror.style[name] = view[name];
    });
    document.body.appendChild(mirror);
    const heights = rows.map((row) => row.offsetHeight);
    mirror.remove();
    if (!heights.length || heights.some((height) => height < 1)) return null;
    return heights;
  }

  function placeLineNumbers() {
    if (!ui.lines || !ui.text) return;
    ui.lines.style.transform = "translateY(" + (-ui.text.scrollTop) + "px)";
  }

  function paintLineNumbers() {
    const text = ui.text;
    const gutter = ui.lines;
    const box = ui.lineBox;
    if (!text || !gutter || !box) return;
    const lines = String(text.value || "").split("\n");
    const count = lines.length || 1;
    if (gutter.childElementCount !== count) {
      const frag = document.createDocumentFragment();
      for (let i = 1; i <= count; i++) {
        const row = document.createElement("div");
        row.textContent = String(i);
        frag.appendChild(row);
      }
      gutter.textContent = "";
      gutter.appendChild(frag);
    }
    box.style.width = "calc(" + Math.max(2, String(count).length) + "ch + 14px)";
    const bad = ui.textErrorLine || 0;
    const rows = gutter.children;
    for (let i = 0; i < rows.length; i++) rows[i].classList.toggle("bad", i + 1 === bad);
    const heights = measureWrappedHeights(text, lines);
    if (heights) {
      for (let i = 0; i < rows.length && i < heights.length; i++) rows[i].style.height = heights[i] + "px";
    }
    placeLineNumbers();
  }

  function scheduleLineNumbers() {
    if (ui.lineRaf) return;
    const raf = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 16);
    ui.lineRaf = raf(() => {
      ui.lineRaf = 0;
      paintLineNumbers();
    });
  }

  const TEXT_WIDTH_KEY = "yue-jp-text-width";
  const TEXT_WIDTH_DEFAULT = 420;
  const TEXT_VISIBLE_KEY = "yue-jp-text-visible";
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

  function readSavedTextVisible() {
    try {
      if (typeof localStorage === "undefined") return true;
      const raw = localStorage.getItem(TEXT_VISIBLE_KEY);
      if (raw == null) return true;
      return raw !== "0" && raw !== "false";
    } catch (_err) {
      return true;
    }
  }

  function writeSavedTextVisible(show) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(TEXT_VISIBLE_KEY, show ? "1" : "0");
    } catch (_err) {
      /* private mode and file pages can reject storage */
    }
  }

  function currentDiagram() {
    if (ui.diagram) return normalizeDiagram(ui.diagram.getAttribute("data-diagram"));
    return readSavedDiagram();
  }

  function diagramChoiceLabel(kind) {
    if (kind === "guitar") return m("jpDiagramGuitar");
    if (kind === "ukulele") return m("jpDiagramUkulele");
    return m("jpDiagramOff");
  }

  function syncDiagram() {
    if (!ui.diagram) return;
    const kind = currentDiagram();
    ui.diagram.setAttribute("data-diagram", kind);
    ui.diagram.classList.toggle("on", kind !== DIAGRAM_OFF);
    ui.diagram.innerHTML = diagramIcon(kind);
    const tip = m("jpDiagram") + " · " + diagramChoiceLabel(kind);
    ui.diagram.title = tip;
    ui.diagram.setAttribute("aria-label", tip);
  }

  function cycleDiagram() {
    const order = [DIAGRAM_OFF, "guitar", "ukulele"];
    const cur = currentDiagram();
    const next = order[(Math.max(0, order.indexOf(cur)) + 1) % order.length];
    if (ui.diagram) ui.diagram.setAttribute("data-diagram", next);
    writeSavedDiagram(next);
    syncDiagram();
    ensureJianpu().then(() => renderScore());
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
    chordKey: "",
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
    textErrorLine: 0,
    textMarks: [],
    lyricSelection: null,
    layoutRaf: 0,
    lineRaf: 0,
    saveButton: null,
    saveNote: null,
    saveObserver: null,
    savePoll: 0,
    saveWatch: 0,
    savedNote: false,
    textVisible: true,
    scrollRaf: 0,
    scrollGoal: null,
    sourceAnchors: null,
    sourceAnchorKey: "",
    sourceScrollShown: null,
    sourceScrollAt: 0,
    view: "jianpu",
    songTitle: "",
    past: [],
    future: [],
    textBurst: 0,
    restoring: false,
    keysBound: false,
  };

  function applyTextWidth(px, persist) {
    if (!ui.textPane || !ui.body) return 0;
    if (ui.textVisible === false) return 0;
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
    scheduleLineNumbers();
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
        if (!ui.root || ui.root.hidden || !ui.textPane || ui.textVisible === false) return;
        applyTextWidth(ui.textPane.getBoundingClientRect().width, false);
      });
      observer.observe(ui.body);
    }
  }

  function syncTextVisible() {
    const show = ui.textVisible !== false;
    if (ui.textPane) ui.textPane.hidden = !show;
    if (ui.split) ui.split.hidden = !show;
    if (!ui.root) return;
    const button = ui.root.querySelector("[data-act='text']");
    if (!button) return;
    button.classList.toggle("on", show);
    button.setAttribute("aria-pressed", show ? "true" : "false");
  }

  function setTextVisible(show) {
    ui.textVisible = !!show;
    writeSavedTextVisible(ui.textVisible);
    syncTextVisible();
    if (ui.textVisible) applyTextWidth(readSavedTextWidth(), false);
    else scheduleScoreLayout();
  }

  function ensureDom() {
    if (typeof document === "undefined") return;
    if (ui.root && ui.root.isConnected) return;
    ui.root = null;
    const style = document.createElement("style");
    style.textContent = [
      ".yue-jp-editor{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.6);",
      "display:flex;align-items:stretch;justify-content:center;padding:12px;",
      "font-family:Inter,system-ui,Segoe UI,sans-serif;}",
      ".yue-jp-editor[hidden]{display:none;}",
      ".yue-jp-card{width:100%;height:100%;max-height:100%;min-height:0;",
      "background:#fff;color:#18181b;border-radius:16px;",
      "box-shadow:0 24px 60px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;}",
      "html.dark .yue-jp-card{background:#18181b;color:#fafafa;}",
      ".yue-jp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 14px;",
      "background:#fff;color:#18181b;border-bottom:1px solid #e4e4e7;}",
      "html.dark .yue-jp-bar{background:#18181b;color:#fafafa;border-bottom-color:rgba(255,255,255,.1);}",
      ".yue-jp-bar h2{margin:0 8px 0 0;font-size:16px;font-weight:650;}",
      ".yue-jp-bar button,.yue-jp-tools button{",
      "font:inherit;cursor:pointer;border:1px solid #d4d4d8;border-radius:8px;",
      "background:transparent;color:inherit;}",
      "html.dark .yue-jp-bar button,html.dark .yue-jp-tools button{",
      "border-color:rgba(255,255,255,.15);}",
      ".yue-jp-bar button{padding:6px 10px;}",
      ".yue-jp-bar button:hover,.yue-jp-tools button:hover{",
      "border-color:#f472b6;color:#db2777;}",
      "html.dark .yue-jp-bar button:hover,html.dark .yue-jp-tools button:hover{color:#f9a8d4;}",
      ".yue-jp-bar button.icon{display:inline-flex;align-items:center;justify-content:center;",
      "width:32px;height:32px;padding:0;}",
      ".yue-jp-bar button.icon svg{width:15px;height:15px;display:block;fill:currentColor;}",
      ".yue-jp-bar button.on,.yue-jp-tools button.on{",
      "background:rgba(236,72,153,.15);border-color:#ec4899;color:#db2777;box-shadow:none;}",
      "html.dark .yue-jp-bar button.on,html.dark .yue-jp-tools button.on{color:#f9a8d4;}",
      ".yue-jp-bar button[hidden]{display:none;}",
      ".yue-jp-bar button:disabled{opacity:.35;cursor:default;}",
      ".yue-jp-bar button:disabled:hover{border-color:#d4d4d8;color:inherit;}",
      "html.dark .yue-jp-bar button:disabled:hover{border-color:rgba(255,255,255,.15);color:inherit;}",
      ".yue-jp-bar button.primary{border:0;background:linear-gradient(to right,#f97316,#db2777);",
      "color:#fff;font-weight:700;}",
      ".yue-jp-bar button.primary:hover{color:#fff;filter:brightness(1.1);}",
      ".yue-jp-bar button.primary.on{box-shadow:none;}",
      ".yue-jp-meta{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;",
      "opacity:.85;font-size:13px;margin-right:auto;}",
      ".yue-jp-meta label{display:inline-flex;align-items:center;gap:4px;}",
      ".yue-jp-chord-key{font:inherit;color:inherit;background:transparent;",
      "border:1px solid #d4d4d8;border-radius:8px;padding:2px 4px;}",
      "html.dark .yue-jp-chord-key{border-color:rgba(255,255,255,.15);background:#18181b;}",
      ".yue-jp-tools{display:flex;flex-wrap:wrap;gap:8px 0;align-items:center;",
      "padding:8px 6px 10px;background:#fff;color:#18181b;",
      "border-bottom:1px solid #e4e4e7;}",
      "html.dark .yue-jp-tools{background:#18181b;color:#fafafa;border-bottom-color:rgba(255,255,255,.1);}",
      ".yue-jp-tools[hidden]{display:none;}",
      ".yue-jp-group{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:0 8px;}",
      ".yue-jp-group[hidden]{display:none;}",
      ".yue-jp-group:not([hidden]) + .yue-jp-group:not([hidden]){border-left:1px solid #e4e4e7;}",
      "html.dark .yue-jp-group:not([hidden]) + .yue-jp-group:not([hidden]){border-left-color:rgba(255,255,255,.1);}",
      ".yue-jp-tools button{padding:4px 8px;min-width:28px;}",
      ".yue-jp-tools input.yue-jp-bars{width:3em;padding:4px 2px;text-align:center;",
      "font:inherit;color:inherit;background:transparent;border:1px solid #d4d4d8;border-radius:8px;}",
      "html.dark .yue-jp-tools input.yue-jp-bars{border-color:rgba(255,255,255,.15);}",
      ".yue-jp-tools button.digit{font-weight:700;min-width:32px;}",
      ".yue-jp-tools button.icon{display:inline-flex;align-items:center;justify-content:center;padding:4px;}",
      ".yue-jp-tools button.icon svg{width:15px;height:15px;display:block;fill:currentColor;}",
      ".yue-jp-status{min-height:1.4em;padding:8px 14px;color:#71717a;font-size:13px;}",
      ".yue-jp-status.ok{color:#059669;font-weight:650;}",
      "html.dark .yue-jp-status.ok{color:#34d399;}",
      ".yue-jp-body{display:flex;flex:1;min-height:0;min-width:0;}",
      ".yue-jp-paper{position:relative;overflow:auto;padding:8px 16px 16px;flex:1;min-width:0;min-height:0;",
      "background:#fff;color:#18181b;}",
      ".yue-jp-text{flex:0 0 420px;width:420px;min-width:0;min-height:0;",
      "display:flex;flex-direction:column;gap:4px;padding:0 12px 12px;",
      "box-sizing:border-box;}",
      ".yue-jp-text[hidden],.yue-jp-split[hidden]{display:none;}",
      ".yue-jp-split{flex:0 0 8px;width:8px;margin:0;padding:0;border:0;cursor:col-resize;",
      "touch-action:none;background:transparent;position:relative;}",
      ".yue-jp-split::before{content:\"\";position:absolute;top:8px;bottom:8px;left:3px;width:2px;",
      "background:#d4d4d8;border-radius:1px;}",
      "html.dark .yue-jp-split::before{background:rgba(255,255,255,.15);}",
      ".yue-jp-split:hover::before,.yue-jp-split:focus::before,.yue-jp-split:focus-visible::before,",
      ".yue-jp-split.dragging::before{background:#ec4899;}",
      ".yue-jp-split:focus{outline:none;}",
      ".yue-jp-editor.yue-jp-dragging,.yue-jp-editor.yue-jp-dragging *{cursor:col-resize;user-select:none;}",
      ".yue-jp-text label{font-size:13px;font-weight:650;}",
      ".yue-jp-check{margin:0;min-height:1.3em;font-size:12px;line-height:1.4;color:#71717a;}",
      ".yue-jp-check.ok{color:#059669;}",
      ".yue-jp-check.bad{color:#e11d48;}",
      "html.dark .yue-jp-check.ok{color:#34d399;}",
      "html.dark .yue-jp-check.bad{color:#fb7185;}",
      ".yue-jp-text-frame{position:relative;flex:1;min-width:0;min-height:0;display:flex;",
      "overflow:hidden;border:1px solid #e4e4e7;border-radius:8px;background:#fafafa;}",
      "html.dark .yue-jp-text-frame{border-color:rgba(255,255,255,.1);background:#09090b;}",
      ".yue-jp-text-frame:focus-within{outline:2px solid #ec4899;}",
      ".yue-jp-lines{flex:0 0 auto;overflow:hidden;align-self:stretch;min-width:2.4em;",
      "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#a1a1aa;}",
      ".yue-jp-lines-inner{box-sizing:border-box;padding:8px 6px 0 8px;text-align:right;",
      "user-select:none;pointer-events:none;}",
      ".yue-jp-lines-inner div.bad{color:#e11d48;font-weight:700;}",
      "html.dark .yue-jp-lines-inner div.bad{color:#fb7185;}",
      ".yue-jp-text textarea{box-sizing:border-box;margin:0;flex:1 1 auto;width:0;min-width:0;height:100%;resize:none;",
      "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;",
      "padding:8px;border:0;border-radius:0;background:transparent;",
      "white-space:pre-wrap;overflow-wrap:break-word;word-wrap:break-word;",
      "color:#18181b;}",
      "html.dark .yue-jp-text textarea{color:#fafafa;background:transparent;}",
      ".yue-jp-text textarea::selection{background:rgba(236,72,153,.28);}",
      ".yue-jp-text textarea:focus{outline:none;}",
      ".yue-jp-hint{margin:0;font-size:12px;line-height:1.4;color:#71717a;}",
      ".yue-jp-paper svg{display:block;max-width:100%;height:auto;margin:0 auto;",
      "user-select:none;-webkit-user-select:none;}",
      ".yue-jp-paper svg path,.yue-jp-paper svg line{pointer-events:none;}",
      ".yue-sel-box{fill:rgba(224,49,49,.16);stroke:#e03131;pointer-events:none;}",
      ".yue-join-box{fill:rgba(224,49,49,.1);stroke:#e03131;pointer-events:none;}",
      "text[data-lyric].yue-sel{fill:#c22525;}",
      "text.fj.yue-sel{fill:#c22525;}",
      "text.fj.yue-jp-mismatch{fill:#d9480f;}",
      "text.fj.yue-play{fill:#0b7285;}",
      "line.yue-playhead{stroke:#e03131;stroke-width:2;pointer-events:none;}",
      ".yue-jp-lead{color:#18181b;max-width:920px;margin:0 auto;padding:8px 4px 32px;",
      "font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;}",
      "html.dark .yue-jp-lead{color:#fafafa;}",
      ".yue-jp-lead-title{font-size:28px;font-weight:700;margin:0 0 8px;}",
      ".yue-jp-lead-meta{display:flex;flex-wrap:wrap;gap:10px 18px;margin:0 0 16px;",
      "padding:10px 12px;border:1px solid #e4e4e7;border-radius:10px;font-size:13px;}",
      "html.dark .yue-jp-lead-meta{border-color:rgba(255,255,255,.12);}",
      ".yue-jp-lead-meta b{font-weight:650;margin-right:6px;opacity:.7;}",
      ".yue-jp-lead-diags{display:flex;flex-wrap:wrap;gap:14px 18px;margin:0 0 20px;}",
      ".yue-jp-lead-chord{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:56px;}",
      ".yue-jp-lead-chord-name{font-size:13px;font-weight:650;}",
      ".yue-jp-lead-diag{display:block;color:#18181b;}",
      "html.dark .yue-jp-lead-diag{color:#fafafa;}",
      ".yue-jp-lead-sec{margin:0 0 14px;}",
      ".yue-jp-lead-sec-h{margin:0 0 10px;padding:6px 12px;border-radius:6px;",
      "background:#e4e4e7;font-size:14px;font-weight:650;}",
      "html.dark .yue-jp-lead-sec-h{background:#3f3f46;}",
      ".yue-jp-lead-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:0;margin:0 0 12px;}",
      ".yue-jp-lead-cell{display:flex;flex-direction:column;align-items:center;",
      "min-width:1.2em;padding:0 1px;}",
      ".yue-jp-lead-cell.bar{min-width:.6em;padding:0 4px;opacity:.45;}",
      ".yue-jp-lead-ch{min-height:1.15em;font-size:13px;font-weight:700;color:#c22525;",
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.15;}",
      "html.dark .yue-jp-lead-ch{color:#fb7185;}",
      ".yue-jp-lead-ly{min-height:1.35em;white-space:pre;}",
      ".yue-jp-bar button.lead-label{padding:6px 10px;font-size:13px;}",
    ].join("");
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.className = "yue-jp-editor";
    root.hidden = true;
    root.innerHTML = [
      '<div class="yue-jp-card" tabindex="-1">',
      '<div class="yue-jp-bar">',
      '<h2 data-i18n="jpTitle"></h2>',
      '<span class="yue-jp-meta">',
      '<span class="yue-jp-meta-title"></span>',
      '<label><span data-i18n="jpLeadKey"></span> <select class="yue-jp-chord-key"></select></label>',
      '<span class="yue-jp-capo"></span>',
      '<label><span data-i18n="jpOriginalKey"></span> <b class="yue-jp-orig-key"></b></label>',
      '<span class="yue-jp-meta-tempo"></span>',
      '</span>',
      '<button type="button" class="icon" data-act="diagram" data-diagram="off">' + DIAGRAM_OFF_ICON + "</button>",
      '<button type="button" class="icon" data-act="text" data-i18n-aria="jpTextScore" data-i18n-title="jpTextScore" aria-pressed="true">' + TEXT_ICON + "</button>",
      '<button type="button" class="lead-label" data-act="lead" data-i18n="jpLead" data-i18n-aria="jpLead" data-i18n-title="jpLead"></button>',
      '<button type="button" class="icon" data-act="print" data-i18n-aria="jpPdf" data-i18n-title="jpPdfHint">' + PRINT_ICON + "</button>",
      '<button type="button" class="icon" data-act="mode" data-mode="midi" title="MIDI" aria-label="MIDI" hidden>' + MIDI_ICON + "</button>",
      '<button type="button" class="icon" data-act="mode" data-mode="source" data-i18n-aria="jpSource" data-i18n-title="jpSource" hidden>' + SOURCE_ICON + "</button>",
      '<button type="button" class="icon" data-act="play" data-i18n-aria="jpPlay" data-i18n-title="jpPlay">' + PLAY_ICON + "</button>",
      '<button type="button" class="icon" data-act="stop" data-i18n-aria="jpStop" data-i18n-title="jpStop">' + STOP_ICON + "</button>",
      '<span class="yue-jp-clock">0:00</span>',
      '<button type="button" class="icon" data-act="undo" data-i18n-aria="jpUndo" data-i18n-title="jpUndo" disabled>' + UNDO_ICON + "</button>",
      '<button type="button" class="icon" data-act="redo" data-i18n-aria="jpRedo" data-i18n-title="jpRedo" disabled>' + REDO_ICON + "</button>",
      '<button type="button" class="icon" data-act="save" data-i18n-aria="jpSave" data-i18n-title="jpSave">' + SAVE_ICON + "</button>",
      '<button type="button" class="icon primary" data-act="ok" data-i18n-aria="jpDone" data-i18n-title="jpDone">' + DONE_ICON + "</button>",
      '<button type="button" class="icon" data-act="cancel" data-i18n-aria="jpCancel" data-i18n-title="jpCancel">' + CANCEL_ICON + "</button>",
      "</div>",
      '<div class="yue-jp-tools" hidden></div>',
      '<div class="yue-jp-status" aria-live="polite"></div>',
      '<div class="yue-jp-body">',
      '<div class="yue-jp-text">',
      '<label for="yue-jp-score-text" data-i18n="jpTextScore"></label>',
      '<p class="yue-jp-check"></p>',
      '<div class="yue-jp-text-frame">',
      '<div class="yue-jp-lines" aria-hidden="true"><div class="yue-jp-lines-inner"></div></div>',
      '<textarea id="yue-jp-score-text" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="soft" data-i18n-aria="jpTextScore"></textarea>',
      "</div>",
      '<p class="yue-jp-hint"></p>',
      "</div>",
      '<div class="yue-jp-split" role="separator" aria-orientation="vertical"',
      ' data-i18n-aria="jpSplitAria" aria-valuemin="220" aria-valuemax="420" aria-valuenow="420" tabindex="0"></div>',
      '<div class="yue-jp-paper"></div>',
      "</div>",
      "</div>",
    ].join("");
    document.body.appendChild(root);
    ui.root = root;
    ui.card = root.querySelector(".yue-jp-card");
    ui.meta = root.querySelector(".yue-jp-meta");
    ui.chordKeySelect = ui.meta.querySelector(".yue-jp-chord-key");
    ui.chordKeySelect.addEventListener("change", () => {
      ui.chordKey = ui.chordKeySelect.value;
      renderScore();
    });
    ui.status = root.querySelector(".yue-jp-status");
    ui.body = root.querySelector(".yue-jp-body");
    ui.textPane = root.querySelector(".yue-jp-text");
    ui.split = root.querySelector(".yue-jp-split");
    ui.paper = root.querySelector(".yue-jp-paper");
    ui.clock = root.querySelector(".yue-jp-clock");
    ui.tools = root.querySelector(".yue-jp-tools");
    ui.text = root.querySelector("#yue-jp-score-text");
    ui.lineBox = root.querySelector(".yue-jp-lines");
    ui.lines = root.querySelector(".yue-jp-lines-inner");
    ui.check = root.querySelector(".yue-jp-check");
    ui.hint = root.querySelector(".yue-jp-hint");
    ui.diagram = root.querySelector("[data-act='diagram']");
    ui.hint.textContent = m('jpHint');
    if (ui.diagram) {
      ui.diagram.setAttribute("data-diagram", readSavedDiagram());
      syncDiagram();
    }
    fillTools(ui.tools);
    syncTools();
    ui.text.addEventListener("input", () => {
      if (!ui.textSilent) ui.textErrorLine = 0;
      paintLineNumbers();
      if (ui.textSilent) return;
      ui.textDirty = true;
      clearSavedNote();
      if (ui.textTimer) clearTimeout(ui.textTimer);
      ui.textTimer = setTimeout(applyText, 120);
    });
    ui.text.addEventListener("scroll", placeLineNumbers);
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
      else if (act === "diagram") cycleDiagram();
      else if (act === "lead") openLeadWindow();
      else if (act === "print") printJianpu();
      else if (act === "text") setTextVisible(ui.textVisible === false);
      else if (act === "play") togglePlay();
      else if (act === "stop") stopPlayback();
      else if (act === "undo") undoEdit();
      else if (act === "redo") redoEdit();
      else if (act === "save") saveEdit();
      else if (act === "ok") acceptText();
      else if (act === "cancel") finish(null);
      else if (act === "align-lyrics") alignLyricsFromCaret();
      else if (act === "reflow") run({ op: "reflow" });
      else if (act === "lyric-sustain") insertLyricMark("-");
      else if (act === "lyric-empty") insertLyricMark("·");
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
    if (!ui.keysBound) {
      ui.keysBound = true;
      document.addEventListener("keydown", (event) => {
        if (!ui.root || ui.root.hidden) return;
        if ((event.ctrlKey || event.metaKey) && !event.altKey) {
          const key = String(event.key).toLowerCase();
          if (key === "s") {
            event.preventDefault();
            saveEdit();
            return;
          }
          if (key === "z" || key === "y") {
            event.preventDefault();
            if (key === "y" || event.shiftKey) redoEdit();
            else undoEdit();
            return;
          }
        }
        if (ui.text && event.target === ui.text) return;
        if (ui.split && event.target === ui.split) return;
        onKey(event);
      });
    }
    bindSplitter();
  }

  function formatClock(seconds) {
    const safe = Math.max(0, seconds || 0);
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60);
    return m + ":" + String(s).padStart(2, "0");
  }


  function applyChrome() {
    if (!ui.root) return;
    ui.root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = m(el.getAttribute("data-i18n"));
    });
    ui.root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", m(el.getAttribute("data-i18n-aria")));
    });
    ui.root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = m(el.getAttribute("data-i18n-title"));
    });
    if (ui.hint) ui.hint.textContent = m("jpHint");
    if (ui.abc && ui.meta) {
      const info = inspectScore(ui.abc);
      paintCapo(info.error ? "" : info.keyName, info.error ? "" : chosenChordKey(info.keyName));
    }
    if (ui.scoreSvg && ui.root && !ui.root.hidden && typeof abc2svg !== "undefined" && abc2svg.jianpu) {
      renderScore();
    }
    if (ui.tools) {
      ui.tools.innerHTML = "";
      fillTools(ui.tools);
      syncTools();
    }
    setPlayLabel(ui.playing ? "pause" : "play");
    syncDiagram();
    syncTextVisible();
    syncLeadButton();
    syncHistoryButtons();
  }

  function syncLeadButton() {
    const button = ui.root && ui.root.querySelector("[data-act='lead']");
    if (!button) return;
    button.classList.remove("on");
    button.removeAttribute("aria-pressed");
    button.textContent = m("jpLead");
    button.title = m("jpLead");
    button.setAttribute("aria-label", m("jpLead"));
    button.setAttribute("data-i18n", "jpLead");
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function leadSheetBodyHtml(sheet) {
    let html = '<div class="yue-jp-lead">';
    if (sheet.title) html += '<h3 class="yue-jp-lead-title">' + escapeHtml(sheet.title) + "</h3>";
    html += '<div class="yue-jp-lead-meta">'
      + "<div><b>" + escapeHtml(m("jpLeadMeter")) + "</b>" + escapeHtml(sheet.meter) + "</div>"
      + "<div><b>" + escapeHtml(m("jpLeadTempo")) + "</b>" + escapeHtml(String(sheet.bpm)) + "</div>"
      + "<div><b>" + escapeHtml(m("jpLeadKey")) + "</b>" + escapeHtml(sheet.keyLabel) + "</div>"
      + (sheet.capoFret == null ? "" : "<div>" + escapeHtml(m("jpCapoAt", { n: sheet.capoFret })) + "</div>")
      + "<div><b>" + escapeHtml(m("jpOriginalKey")) + "</b>" + escapeHtml(sheet.originalKeyLabel || sheet.keyLabel) + "</div>"
      + "</div>";
    if (sheet.chords.length) {
      html += '<div class="yue-jp-lead-diags">';
      for (const chord of sheet.chords) {
        html += '<div class="yue-jp-lead-chord"><div class="yue-jp-lead-chord-name">'
          + escapeHtml(chord.symbol) + "</div>";
        const diag = guitarDiagramSvg(chord.frets);
        html += diag || '<div class="yue-jp-lead-diag" style="height:56px"></div>';
        html += "</div>";
      }
      html += "</div>";
    }
    for (const section of sheet.sections) {
      html += '<section class="yue-jp-lead-sec">';
      if (section.label) {
        html += '<div class="yue-jp-lead-sec-h">' + escapeHtml(section.label) + "</div>";
      }
      for (const line of section.lines) {
        html += '<div class="yue-jp-lead-row">';
        for (const cell of line.cells) {
          html += '<div class="yue-jp-lead-cell' + (cell.bar ? " bar" : "") + '">'
            + '<div class="yue-jp-lead-ch">' + escapeHtml(cell.chord || "\u00a0") + "</div>"
            + '<div class="yue-jp-lead-ly">' + escapeHtml(cell.text || "") + "</div>"
            + "</div>";
        }
        html += "</div>";
      }
      html += "</section>";
    }
    html += "</div>";
    return html;
  }

  function leadSheetDocument(sheet) {
    const title = escapeHtml(sheet.title || m("jpLead"));
    const css = [
      "html,body{margin:0;padding:0;background:#fff;color:#18181b;}",
      "body{padding:24px 28px 48px;}",
      ".yue-jp-lead{color:#18181b;max-width:920px;margin:0 auto;",
      "font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;}",
      ".yue-jp-lead-title{font-size:28px;font-weight:700;margin:0 0 8px;}",
      ".yue-jp-lead-meta{display:flex;flex-wrap:wrap;gap:10px 18px;margin:0 0 16px;",
      "padding:10px 12px;border:1px solid #e4e4e7;border-radius:10px;font-size:13px;}",
      ".yue-jp-lead-meta b{font-weight:650;margin-right:6px;opacity:.7;}",
      ".yue-jp-lead-diags{display:flex;flex-wrap:wrap;gap:14px 18px;margin:0 0 20px;}",
      ".yue-jp-lead-chord{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:56px;}",
      ".yue-jp-lead-chord-name{font-size:13px;font-weight:650;}",
      ".yue-jp-lead-diag{display:block;color:#18181b;}",
      ".yue-jp-lead-sec{margin:0 0 14px;}",
      ".yue-jp-lead-sec-h{margin:0 0 10px;padding:6px 12px;border-radius:6px;",
      "background:#e4e4e7;font-size:14px;font-weight:650;}",
      ".yue-jp-lead-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:0;margin:0 0 12px;}",
      ".yue-jp-lead-cell{display:flex;flex-direction:column;align-items:center;",
      "min-width:1.2em;padding:0 1px;}",
      ".yue-jp-lead-cell.bar{min-width:.6em;padding:0 4px;opacity:.45;}",
      ".yue-jp-lead-ch{min-height:1.15em;font-size:13px;font-weight:700;color:#c22525;",
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.15;}",
      ".yue-jp-lead-ly{min-height:1.35em;white-space:pre;color:#18181b;}",
    ].join("");
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>"
      + title + "</title><style>" + css + "</style></head><body>"
      + leadSheetBodyHtml(sheet) + "</body></html>";
  }

  function openLeadWindow() {
    const sheet = leadSheet(ui.abc, ui.songTitle, chosenChordKey(parseHeader(String(ui.abc || "").split(/\r?\n/)).key.name));
    if (sheet.error) {
      setStatus(m("jpLeadFail"));
      return;
    }
    const html = leadSheetDocument(sheet);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "yue-jianpu-lead");
    if (!win) {
      URL.revokeObjectURL(url);
      setStatus(m("jpLeadPopup"));
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function jianpuSvgParts(abc, diagram) {
    const buf = [];
    const renderer = new abc2svg.Abc({
      img_out: (svg) => buf.push(fitDiagramSvg(svg)),
      errbld: () => {},
      errmsg: () => {},
      read_file: () => "",
    });
    if (typeof abc2svg.diag !== "undefined" && abc2svg.diag.set_hooks) {
      abc2svg.diag.set_hooks(renderer);
    }
    renderer.tosvg("jianpu", previewAbc(abc, diagram));
    return buf.filter(Boolean);
  }

  // Rasterized SVG blobs ignore the page stylesheet; music + lyric fonts live there.
  const CJK_PDF = '"Yu Gothic UI","Microsoft YaHei","Malgun Gothic",sans-serif';

  function rewriteCjkFonts(text) {
    return String(text || "")
      .replace(/\btext,\s*serif\b/g, CJK_PDF)
      .replace(/\btext,\s*sans-serif\b/g, CJK_PDF)
      .replace(/(\bfont:\s*[\d.]+px\s+)sans-serif\b/g, "$1" + CJK_PDF);
  }

  function pdfFontCss() {
    const sheet = typeof abc2svg !== "undefined" && abc2svg.sheet;
    if (!sheet || !sheet.cssRules) return "";
    const parts = [];
    for (let i = 0; i < sheet.cssRules.length; i++) {
      const rule = sheet.cssRules[i];
      if (rule && rule.cssText) parts.push(rule.cssText);
    }
    return rewriteCjkFonts(parts.join("\n"));
  }

  function embedPdfFonts(svgText) {
    const css = pdfFontCss();
    let out = String(svgText || "");
    if (css) {
      out = out.replace(/<svg\b([^>]*)>/, (tag, attrs) =>
        "<svg" + attrs + '><style type="text/css"><![CDATA[\n' + css + "\n]]></style>");
    }
    return rewriteCjkFonts(out);
  }

  function printJianpu() {
    ensureJianpu().then((ok) => {
      if (!ok) {
        setStatus(m("jpModuleMissing"));
        return;
      }
      try {
        const svgs = jianpuSvgParts(ui.abc, currentDiagram()).map(embedPdfFonts);
        if (!svgs.length) {
          setStatus(m("jpEmpty"));
          return;
        }
        const title = escapeHtml(displayTitle(ui.abc, ui.songTitle) || m("jpPdf"));
        const css = [
          "@page{size:A4;margin:12mm;}",
          "html,body{margin:0;padding:0;background:#fff;color:#18181b;}",
          "body{padding:0;}",
          ".page{max-width:100%;}",
          "svg{display:block;width:100%;height:auto;margin:0 0 8mm;break-inside:avoid;page-break-inside:avoid;}",
        ].join("");
        const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>"
          + title + "</title><style>" + css + "</style></head><body><div class=\"page\">"
          + svgs.join("") + "</div></body></html>";
        const frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
        document.body.appendChild(frame);
        const doc = frame.contentDocument;
        const win = frame.contentWindow;
        if (!doc || !win) {
          frame.remove();
          setStatus(m("jpPdfFail"));
          return;
        }
        doc.open();
        doc.write(html);
        doc.close();
        const cleanup = () => {
          setTimeout(() => frame.remove(), 1000);
        };
        win.addEventListener("afterprint", cleanup, { once: true });
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch (err) {
            cleanup();
            setStatus(String((err && err.message) || err || m("jpPdfFail")));
          }
        }, 50);
      } catch (err) {
        setStatus(String((err && err.message) || err || m("jpPdfFail")));
      }
    });
  }

  function setStatus(text) {
    if (!ui.status) return;
    ui.status.textContent = text || "";
    ui.status.classList.remove("ok");
  }

  function reportSaved(text) {
    stopSaveWatch();
    ui.savedNote = true;
    ui.savedSticky = true;
    if (!ui.status) return;
    ui.status.textContent = text || "";
    ui.status.classList.add("ok");
  }

  function clearSavedNote() {
    if (!ui.savedNote) return;
    ui.savedNote = false;
    if (ui.savedSticky) { ui.savedSticky = false; setStatus(""); }
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
      ui.savedSticky = true;
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
    const scoreGroups = [
      ["1", "2", "3", "4", "5", "6", "7", "0"].map((digit) => ({
        label: digit,
        title: digit === "0" ? m("jpRest0") : m("jpDegree", { digit: digit }),
        className: "digit",
        attrs: { act: "degree", degree: digit },
      })),
      [
        { label: "↑", title: m("jpOctaveUp"), attrs: { act: "octave", delta: "1" } },
        { label: "↓", title: m("jpOctaveDown"), attrs: { act: "octave", delta: "-1" } },
        { label: "♯", title: m("jpSharp"), attrs: { act: "accidental", kind: "sharp" } },
        { label: "♭", title: m("jpFlat"), attrs: { act: "accidental", kind: "flat" } },
        { label: "♮", title: m("jpNatural"), attrs: { act: "accidental", kind: "natural" } },
      ],
      [
        { label: "½", title: m("jpHalve"), attrs: { act: "duration", factor: "0.5" } },
        { label: "×2", title: m("jpDouble"), attrs: { act: "duration", factor: "2" } },
        { label: m("jpDot"), title: m("jpDotTitle"), attrs: { act: "duration", factor: "1.5" } },
        { label: m("jpSustain"), title: m("jpSustainTitle"), attrs: { act: "sustain" } },
      ],
      [
        { label: m("jpTie"), title: m("jpTieTitle"), attrs: { act: "tie" } },
        { label: m("jpDownbeat"), title: m("jpDownbeatTitle"), attrs: { act: "downbeat" } },
        { label: m("jpJoin"), title: m("jpJoinTitle"), attrs: { act: "join" } },
        { label: m("jpAddBeat"), title: m("jpAddBeatTitle"), attrs: { act: "add-beat" } },
        { label: m("jpDeleteBar"), title: m("jpDeleteBarTitle"), attrs: { act: "delete-bar" } },
        { label: m("jpReflow"), title: m("jpReflowTitle"), attrs: { act: "reflow" } },
        { label: m("jpInsert"), title: m("jpInsertTitle"), attrs: { act: "insert" } },
        { label: m("jpDelete"), title: m("jpDeleteTitle"), attrs: { act: "delete" } },
      ],
    ];
    const lyricGroups = [
      [
        {
          label: "·",
          title: m("jpLyricEmptyTitle"),
          aria: m("jpLyricEmptyTitle"),
          attrs: { act: "lyric-empty" },
        },
        {
          label: m("jpSustain"),
          title: m("jpLyricSustainTitle"),
          attrs: { act: "lyric-sustain" },
        },
        {
          html: ALIGN_LYRICS_ICON,
          title: m("jpAlignLyricsTitle"),
          aria: m("jpAlignLyrics"),
          className: "icon",
          attrs: { act: "align-lyrics" },
        },
      ],
    ];
    const append = (groups, kind) => {
      groups.forEach((specs) => {
        const group = document.createElement("div");
        group.className = "yue-jp-group";
        group.setAttribute("data-for", kind);
        specs.forEach((spec) => {
          const button = document.createElement("button");
          button.type = "button";
          if (spec.className) button.className = spec.className;
          if (spec.html) button.innerHTML = spec.html;
          else button.textContent = spec.label;
          button.title = spec.title;
          if (spec.aria) button.setAttribute("aria-label", spec.aria);
          Object.keys(spec.attrs).forEach((key) => button.setAttribute("data-" + key, spec.attrs[key]));
          if (spec.attrs.act === "join") {
            button.addEventListener("pointerenter", previewJoin);
            button.addEventListener("pointerleave", clearJoinPreview);
            button.addEventListener("focus", previewJoin);
            button.addEventListener("blur", clearJoinPreview);
          }
          group.appendChild(button);
          if (spec.attrs.act === "reflow") {
            group.appendChild(barCountField("min"));
            group.appendChild(barCountField("max"));
          }
        });
        root.appendChild(group);
      });
    };
    append(scoreGroups, "score");
    append(lyricGroups, "lyrics");
  }

  // Insert a lyric token ("-" hold, "·" empty syllable) into the L: line at the caret.
  function insertLyricMark(token) {
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
      applyText();
    }
    if (!ui.text) return;
    if (ui.textBlocked) {
      setStatus(ui.textError || m("jpFixTextFirst"));
      return;
    }
    clearSavedNote();
    const value = ui.text.value;
    let start = ui.text.selectionStart || 0;
    let end = ui.text.selectionEnd == null ? start : ui.text.selectionEnd;
    if (Array.isArray(ui.lyricSelection) && ui.lyricSelection.length && ui.textMarks.length) {
      const want = new Set(ui.lyricSelection);
      let last = null;
      for (const mark of ui.textMarks) {
        if (!mark || mark.kind !== "lyric" || !want.has(mark.index)) continue;
        if (!last || mark.end >= last.end) last = mark;
      }
      if (last) {
        start = last.end;
        end = last.end;
      }
    }
    if (!caretOnLyricLine(value, start)) {
      if (token === "-") run({ op: "sustain" });
      return;
    }
    const left = value.slice(0, start);
    const right = value.slice(end);
    const padL = left.length && !/\s$/.test(left) ? " " : "";
    const padR = right.length && !/^\s/.test(right) ? " " : "";
    const chunk = padL + token + padR;
    const next = left + chunk + right;
    const caret = left.length + padL.length + token.length;
    ui.textSilent = true;
    ui.text.value = next;
    ui.textSilent = false;
    ui.textDirty = true;
    try {
      if (ui.text.focus) ui.text.focus({ preventScroll: true });
      ui.text.setSelectionRange(caret, caret);
    } catch (_err) {
      /* textarea may be detached */
    }
    applyText();
    syncCaret();
  }

  function alignLyricsFromCaret() {
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
      applyText();
    }
    if (ui.textBlocked) {
      setStatus(ui.textError || m("jpFixTextFirst"));
      return;
    }
    if (!ui.text) return;
    clearSavedNote();
    const caret = ui.text.selectionStart || 0;
    const result = alignLyricsAfter(ui.text.value, ui.sourceAbc || ui.abc, caret);
    if (result.error) {
      setStatus(result.error);
      return;
    }
    if (result.none) {
      setStatus(m("jpAlignLyricsNone"));
      return;
    }
    stopPlayback();
    if (result.abc !== ui.abc) remember("edit");
    ui.abc = result.abc;
    refreshTextFromAbc();
    renderScore();
    try {
      if (ui.text.focus) ui.text.focus({ preventScroll: true });
      const at = Math.max(0, Math.min(result.caret || 0, ui.text.value.length));
      ui.text.setSelectionRange(at, at);
    } catch (_err) {
      /* textarea may be detached */
    }
    syncCaret();
    if (result.leftover) setStatus(m("jpLeftoverSyllables", { count: result.leftover }));
    else if (!ui.statusSticky) setStatus("");
  }

  function commandFrom(button) {
    const act = button.getAttribute("data-act");
    if (act === "degree") return { op: "degree", degree: Number(button.getAttribute("data-degree")) };
    if (act === "octave") return { op: "octave", delta: Number(button.getAttribute("data-delta")) };
    if (act === "accidental") return { op: "accidental", kind: button.getAttribute("data-kind") };
    if (act === "duration") return { op: "duration", factor: Number(button.getAttribute("data-factor")) };
    if (act === "tie" || act === "sustain" || act === "insert" || act === "delete"
        || act === "downbeat" || act === "reflow" || act === "join"
        || act === "add-beat" || act === "delete-bar") return { op: act };
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
        return { voice: "Vocal", index: lyricIndex, slice: 0, lyric: true };
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
    if (picked.lyric) {
      selectLyric(picked.index);
      return;
    }
    selectNote(picked.voice, picked.index, picked.slice);
  }

  // Keep the text caret on the syllable so syncCaret stays in lyric mode.
  function selectLyric(index) {
    if (!Number.isInteger(index)) return;
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
      applyText();
    }
    setStatus("");
    markLyricSelection([index]);
    if (ui.text && ui.textMarks && ui.textMarks.length) {
      const mark = ui.textMarks.find((item) => item && item.kind === "lyric" && item.index === index);
      if (mark) {
        try {
          if (document.activeElement !== ui.text && ui.text.focus) {
            ui.text.focus({ preventScroll: true });
          }
          ui.text.setSelectionRange(mark.start, mark.end);
        } catch (_err) {
          /* textarea may be detached */
        }
      }
    }
    followSelection();
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
    const lyricMode = Array.isArray(ui.lyricSelection);
    const ev = ui.index >= 0 ? eventsFor(ui.abc, ui.voice)[ui.index] : null;
    ui.tools.hidden = !(lyricMode || ev);
    ui.tools.querySelectorAll(".yue-jp-group").forEach((group) => {
      const kind = group.getAttribute("data-for");
      group.hidden = lyricMode ? kind !== "lyrics" : kind !== "score";
    });
    if (!ev || lyricMode) return;
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
    followSelection();
  }

  function clearJoinPreview() {
    if (!ui.paper) return;
    ui.paper.querySelectorAll(".yue-join-box").forEach((el) => el.remove());
  }

  function joinButtonHot() {
    const button = ui.tools && ui.tools.querySelector("[data-act='join']");
    return !!(button && (button.matches(":hover") || document.activeElement === button));
  }

  // ponytail: staff rows within 4 digit-heights share a box; a larger gap is the next system
  function drawJoinBoxes(nodes) {
    const placed = [];
    for (const node of nodes) {
      const box = boxInSvg(node);
      if (box) placed.push(box);
    }
    if (!placed.length) return;
    placed.sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const box of placed) {
      const mid = box.y + box.h / 2;
      let row = null;
      for (const candidate of rows) {
        if (candidate.svg === box.svg && Math.abs(candidate.mid - mid) <= Math.max(candidate.h, box.h) * 0.75) {
          row = candidate;
          break;
        }
      }
      if (!row) {
        rows.push({ mid: mid, h: box.h, svg: box.svg, boxes: [box] });
        continue;
      }
      row.boxes.push(box);
      row.h = Math.max(row.h, box.h);
      let sum = 0;
      for (const item of row.boxes) sum += item.y + item.h / 2;
      row.mid = sum / row.boxes.length;
    }
    rows.sort((a, b) => a.mid - b.mid);
    const systems = [];
    for (const row of rows) {
      const prev = systems[systems.length - 1];
      const gap = prev ? row.mid - prev.mid : 0;
      if (!prev || row.svg !== prev.svg || gap > prev.h * 4) {
        systems.push({ h: row.h, svg: row.svg, mid: row.mid, boxes: row.boxes.slice() });
      } else {
        prev.boxes.push.apply(prev.boxes, row.boxes);
        prev.h = Math.max(prev.h, row.h);
        prev.mid = row.mid;
      }
    }
    for (const system of systems) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const box of system.boxes) {
        x0 = Math.min(x0, box.x);
        y0 = Math.min(y0, box.y);
        x1 = Math.max(x1, box.x + box.w);
        y1 = Math.max(y1, box.y + box.h);
      }
      const pad = Math.max(3, system.h * 0.22);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "yue-join-box");
      rect.setAttribute("x", String(x0 - pad));
      rect.setAttribute("y", String(y0 - pad));
      rect.setAttribute("width", String(Math.max(1, x1 - x0 + pad * 2)));
      rect.setAttribute("height", String(Math.max(1, y1 - y0 + pad * 2)));
      rect.setAttribute("rx", String(Math.max(2, pad * 0.45)));
      rect.setAttribute("fill", "rgba(224,49,49,0.1)");
      rect.setAttribute("stroke", "#e03131");
      rect.setAttribute("stroke-width", String(Math.max(1.6, system.h * 0.08)));
      rect.setAttribute("pointer-events", "none");
      system.svg.appendChild(rect);
    }
  }

  function previewJoin() {
    clearJoinPreview();
    if (!ui || ui.index < 0 || !ui.abc) return;
    const found = joinLocate(ui.abc, ui.voice === "Ins" ? "Ins" : "Vocal", ui.index, ui.slice || 0);
    if (found.error || !found.heads) return;
    const want = new Set(found.heads.map((head) => head.voice + ":" + head.index));
    const nodes = heads().filter((el) => want.has((el.dataset.voice || "Vocal") + ":" + el.dataset.idx));
    drawJoinBoxes(nodes);
  }

  function markSelection(locate) {
    ui.lyricSelection = null;
    const nodes = heads();
    if (ui.paper) ui.paper.querySelectorAll(".yue-sel-box,.yue-join-box").forEach((el) => el.remove());
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
    if (joinButtonHot()) previewJoin();
  }

  function markLyricSelection(indexes) {
    const picked = (indexes || []).filter((index) => Number.isInteger(index));
    ui.lyricSelection = picked.slice();
    if (picked.length) {
      ui.voice = "Vocal";
      ui.index = picked[0];
      ui.slice = 0;
    }
    const want = new Set(picked);
    if (ui.paper) ui.paper.querySelectorAll(".yue-sel-box,.yue-join-box").forEach((el) => el.remove());
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
    if (picked.length) reveal(first || fallback);
    followSelection();
  }

  // True when the caret sits on an L: line (prefix alone counts).
  function caretOnLyricLine(text, caret) {
    const value = String(text || "");
    const at = Math.max(0, Math.min(Number(caret) || 0, value.length));
    const lineStart = value.lastIndexOf("\n", Math.max(0, at - 1)) + 1;
    const lineEnd = value.indexOf("\n", at);
    const line = value.slice(lineStart, lineEnd < 0 ? value.length : lineEnd);
    return lyricPrefix(line.trim()) !== "";
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

  // Content y of the first vocal glyph on each system, with that glyph's score clock.
  const SOURCE_ROW_Y_TOL = 18;
  const SOURCE_SCROLL_TAU = 0.16;

  function sourceRowAnchors(paper, marks) {
    if (!paper || !marks || !marks.length || !paper.getBoundingClientRect) return [];
    const paperBox = paper.getBoundingClientRect();
    const scrollTop = paper.scrollTop || 0;
    const byKey = new Map();
    for (const el of heads()) {
      const voice = el.dataset.voice || "Vocal";
      byKey.set(voice + ":" + el.dataset.idx + ":" + (el.dataset.slice || "0"), el);
    }
    const items = [];
    for (const mark of marks) {
      if (!mark || (mark.voice && mark.voice !== "Vocal")) continue;
      const node = byKey.get((mark.voice || "Vocal") + ":" + mark.index + ":" + mark.slice);
      if (!node || !node.getBoundingClientRect) continue;
      const box = node.getBoundingClientRect();
      items.push({
        t: mark.start,
        y: box.top - paperBox.top + scrollTop,
      });
    }
    items.sort((a, b) => a.t - b.t || a.y - b.y);
    const rows = [];
    for (const item of items) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(item.y - last.y) < SOURCE_ROW_Y_TOL) continue;
      rows.push({ t: item.t, y: item.y });
    }
    return rows;
  }

  // Keep the interpolated row y near 35% down the paper. Empty anchors → 0.
  function sourceScrollTop(anchors, now, viewHeight, maxScroll) {
    if (!anchors || !anchors.length) return 0;
    const at = Math.max(0, Number(now) || 0);
    const view = Math.max(0, Number(viewHeight) || 0);
    const max = Math.max(0, Number(maxScroll) || 0);
    let y;
    if (at <= anchors[0].t) y = anchors[0].y;
    else if (at >= anchors[anchors.length - 1].t) y = anchors[anchors.length - 1].y;
    else {
      let i = 0;
      while (i + 1 < anchors.length && anchors[i + 1].t <= at) i += 1;
      const a = anchors[i];
      const b = anchors[i + 1];
      const span = b.t - a.t;
      const p = span > 1e-6 ? (at - a.t) / span : 0;
      y = a.y + p * (b.y - a.y);
    }
    return Math.max(0, Math.min(max, y - view * 0.35));
  }

  // Exponential follow. |target - shown| >= snap → stick; else move by (1 - e^(-dt/tau)).
  function easeScrollStep(shown, target, dt, tau, snap) {
    const to = Number(target);
    if (!Number.isFinite(to)) {
      const from = Number(shown);
      return Number.isFinite(from) ? from : 0;
    }
    const from = Number(shown);
    if (!Number.isFinite(from)) return to;
    const band = Number.isFinite(Number(snap)) ? Math.max(0, Number(snap)) : 0;
    if (band > 0 && Math.abs(to - from) >= band) return to;
    const t = Math.max(0, Number(dt) || 0);
    if (t <= 0) return from;
    const tauSec = Math.max(1e-6, Number(tau) || SOURCE_SCROLL_TAU);
    return from + (to - from) * (1 - Math.exp(-t / tauSec));
  }

  function clearSourceScroll() {
    ui.sourceAnchors = null;
    ui.sourceAnchorKey = "";
    ui.sourceScrollShown = null;
    ui.sourceScrollAt = 0;
  }

  function followSourceScroll(now) {
    const host = ui.paper;
    if (!host) return;
    stopEaseScroll();
    const marks = ui.marks && ui.marks.length ? ui.marks : playMarks(ui.abc);
    ui.marks = marks;
    const key = (host.clientWidth || 0) + "x" + (host.scrollHeight || 0);
    if (!ui.sourceAnchors || ui.sourceAnchorKey !== key) {
      ui.sourceAnchors = sourceRowAnchors(host, marks);
      ui.sourceAnchorKey = key;
    }
    const view = host.clientHeight || 0;
    const maxScroll = Math.max(0, (host.scrollHeight || 0) - view);
    const target = sourceScrollTop(ui.sourceAnchors, now, view, maxScroll);
    const nowMs = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const dt = ui.sourceScrollShown == null || !ui.sourceScrollAt
      ? 0
      : Math.max(0, (nowMs - ui.sourceScrollAt) / 1000);
    const snap = Math.max(80, view * 0.5);
    const next = ui.sourceScrollShown == null
      ? target
      : easeScrollStep(ui.sourceScrollShown, target, dt, SOURCE_SCROLL_TAU, snap);
    ui.sourceScrollShown = next;
    ui.sourceScrollAt = nowMs;
    host.scrollTop = next;
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

  function paintCapo(originalName, selectedName) {
    if (!ui.meta) return;
    const el = ui.meta.querySelector(".yue-jp-capo");
    if (!el) return;
    if (!originalName) {
      el.textContent = "";
      return;
    }
    const fret = capoFret(originalName, selectedName || originalName);
    el.textContent = fret == null ? "" : m("jpCapoAt", { n: fret });
  }

  function syncKeyBar(info, title) {
    if (!ui.meta) return;
    const titleEl = ui.meta.querySelector(".yue-jp-meta-title");
    const origEl = ui.meta.querySelector(".yue-jp-orig-key");
    const tempoEl = ui.meta.querySelector(".yue-jp-meta-tempo");
    const select = ui.chordKeySelect;
    if (!info || info.error) {
      if (titleEl) titleEl.textContent = "";
      if (origEl) origEl.textContent = "";
      if (tempoEl) tempoEl.textContent = "";
      paintCapo("", "");
      if (select) select.hidden = true;
      return;
    }
    if (select) select.hidden = false;
    if (titleEl) titleEl.textContent = title ? title + "  ·  " : "";
    if (origEl) origEl.textContent = info.keyLabel;
    if (tempoEl) tempoEl.textContent = "♩=" + info.bpm;
    const names = signatureNames(keyFromName(info.keyName));
    const selected = chosenChordKey(info.keyName);
    paintCapo(info.keyName, selected);
    ui.chordKey = selected === info.keyName ? "" : selected;
    if (select && select.dataset.keys !== names.join(",")) {
      select.dataset.keys = names.join(",");
      select.innerHTML = names.map((name) => {
        return '<option value="' + name + '">' + jianpuKeyLabel(keyFromName(name)) + "</option>";
      }).join("");
    }
    if (select) select.value = selected;
  }

  function renderScore() {
    stopEaseScroll();
    clearSourceScroll();
    ui.marks = playMarks(ui.abc);
    ui.playhead = null;
    ui.playKey = "";
    syncLeadButton();
    const info = inspectScore(ui.abc);
    const title = displayTitle(ui.abc, ui.songTitle);
    syncKeyBar(info, title);
    if (typeof abc2svg === "undefined" || !abc2svg.Abc || !abc2svg.jianpu) {
      ui.paper.innerHTML = '<p>' + m('jpModuleMissing') + '</p>';
      ui.scoreSvg = "";
      clearMismatch();
      showCheck({ ok: false, message: m('jpCannotCompare') });
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
          ui.statusSticky = true; setStatus(m('jpDiagramFail'));
        } catch (fallbackErr) {
          ui.paper.textContent = m('jpRenderFail');
          ui.scoreSvg = "";
          clearMismatch();
          showCheck({ ok: false, message: m('jpCannotCompare') });
          setStatus(String((fallbackErr && fallbackErr.message) || fallbackErr || err && err.message || err));
          return;
        }
      } else {
        ui.paper.textContent = m('jpRenderFail');
        ui.scoreSvg = "";
        clearMismatch();
        showCheck({ ok: false, message: m('jpCannotCompare') });
        setStatus(String((err && err.message) || err));
        return;
      }
    }
    ui.scoreSvg = svg;
    ui.paper.innerHTML = svg || ('<p>' + m('jpEmpty') + '</p>');
    if (diagram !== DIAGRAM_OFF && svg.indexOf('class="diag"') < 0 && /"[A-G]/.test(ui.abc)) {
      if (!diagReady()) { ui.statusSticky = true; setStatus(m('jpDiagMissing')); }
    }
    const vocalOk = stampVoice("Vocal");
    const insOk = stampVoice("Ins");
    stampLyrics();
    if (!vocalOk) { ui.statusSticky = true; setStatus(m('jpVocalMismatch')); }
    else if (!insOk) { ui.statusSticky = true; setStatus(m('jpInsMismatch')); }
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
      if (!text || text === "V:" || text === "A:" || text.indexOf("=") >= 0) return;
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
      el.setAttribute('aria-label', m('jpLyricAria', { text: (el.textContent || '').replace(/\s+/g, '') }));
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
    ui.textErrorLine = 0;
    ui.textMarks = built.marks || [];
    paintLineNumbers();
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
      showCheck({ ok: false, message: ui.textError || m('jpTextUnreadable') });
      return;
    }
    const svg = ui.scoreSvg || "";
    if (!/<text\b[^>]*\bfj\b/.test(svg)) {
      if (!svg) return;
      clearMismatch();
      showCheck({ ok: false, message: m('jpCannotCompare') });
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
      ui.textError = parsed.error || m('jpBadLine');
      ui.textErrorLine = parsed.line || 0;
      ui.textMarks = [];
      setStatus(ui.textError);
      refreshNoteCheck();
      if (ui.lyricSelection) markSelection();
      showTextMark();
      paintLineNumbers();
      return;
    }
    ui.textBlocked = false;
    ui.textError = "";
    ui.textErrorLine = 0;
    ui.textMarks = parsed.marks || [];
    ui.textDirty = false;
    const changed = parsed.abc !== ui.abc;
    if (changed && !ui.restoring) remember("text");
    ui.abc = parsed.abc;
    if (changed) {
      stopPlayback();
      renderScore();
      followSelection();
    } else refreshNoteCheck();
    if (parsed.warning || parsed.note) setStatus(parsed.warning || parsed.note);
    else if (!ui.statusSticky) setStatus("");
    if (document.activeElement === ui.text) syncCaret();
    showTextMark();
    paintLineNumbers();
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
    placeLineNumbers();
  }

  function syncCaret() {
    if (!ui.text || ui.textBlocked) {
      if (ui.lyricSelection) markSelection();
      return;
    }
    const start = ui.text.selectionStart || 0;
    const end = ui.text.selectionEnd == null ? start : ui.text.selectionEnd;
    if (ui.textMarks.length) {
      const lyrics = lyricIndexesInSelection(ui.textMarks, start, end);
      if (lyrics.length) {
        markLyricSelection(lyrics);
        return;
      }
    }
    if (caretOnLyricLine(ui.text.value, start) || (end !== start && caretOnLyricLine(ui.text.value, end - 1))) {
      markLyricSelection([]);
      return;
    }
    if (!ui.textMarks.length) {
      if (ui.lyricSelection) markSelection();
      return;
    }
    const hadLyrics = Array.isArray(ui.lyricSelection);
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
    followSelection();
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
          ui.textError = parsed.error || m('jpCannotWriteBack');
        }
        setStatus(parsed.error || parsed.warning || m('jpCannotWriteBack'));
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
      setStatus(m('jpCannotSaveHere'));
      return;
    }
    watchSaveNote();
    target.click();
  }

  function currentAbc() {
    return ui.abc || "";
  }

  function snapshot() {
    const start = ui.text ? (ui.text.selectionStart || 0) : 0;
    const end = ui.text && ui.text.selectionEnd != null ? ui.text.selectionEnd : start;
    return {
      abc: ui.abc,
      index: ui.index,
      voice: ui.voice || "Vocal",
      slice: ui.slice || 0,
      caret: start,
      caretEnd: end,
      lyricSelection: Array.isArray(ui.lyricSelection) ? ui.lyricSelection.slice() : null,
    };
  }

  function syncHistoryButtons() {
    if (!ui.root) return;
    const undo = ui.root.querySelector("[data-act='undo']");
    const redo = ui.root.querySelector("[data-act='redo']");
    if (undo) undo.disabled = !ui.past.length;
    if (redo) redo.disabled = !ui.future.length;
  }

  // Text typed within TEXT_BURST_MS of the previous text apply shares one step.
  // A note edit, lyric alignment, or undo closes that burst.
  function remember(kind) {
    if (ui.restoring) return;
    const now = Date.now();
    if (kind === "text" && ui.textBurst && now - ui.textBurst < TEXT_BURST_MS) {
      ui.textBurst = now;
      return;
    }
    const shot = snapshot();
    ui.past.push(shot);
    if (ui.past.length > HISTORY_LIMIT) ui.past.shift();
    ui.future = [];
    ui.textBurst = kind === "text" ? now : 0;
    syncHistoryButtons();
  }

  function restoreSnapshot(shot) {
    ui.restoring = true;
    clearSavedNote();
    stopPlayback();
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
    }
    ui.abc = shot.abc;
    ui.index = shot.index;
    ui.voice = shot.voice || "Vocal";
    ui.slice = shot.slice || 0;
    ui.lyricSelection = null;
    ui.textDirty = false;
    ui.textBlocked = false;
    ui.textError = "";
    ui.textErrorLine = 0;
    ui.statusSticky = false;
    setStatus("");
    refreshTextFromAbc();
    renderScore();
    followSelection();
    if (shot.lyricSelection && shot.lyricSelection.length) markLyricSelection(shot.lyricSelection);
    else markSelection();
    if (ui.text) {
      try {
        const at = Math.max(0, Math.min(shot.caret || 0, ui.text.value.length));
        const end = Math.max(at, Math.min(shot.caretEnd == null ? at : shot.caretEnd, ui.text.value.length));
        ui.text.setSelectionRange(at, end);
      } catch (_err) {
        /* textarea may be detached */
      }
    }
    ui.restoring = false;
    ui.textBurst = 0;
    syncHistoryButtons();
  }

  function settleTextForHistory() {
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
    }
    if (ui.text && (ui.textDirty || ui.textBlocked)) applyText();
  }

  function undoEdit() {
    settleTextForHistory();
    if (ui.textBlocked) {
      refreshTextFromAbc();
      return;
    }
    if (!ui.past.length) return;
    const current = snapshot();
    ui.future.push(current);
    restoreSnapshot(ui.past.pop());
  }

  function redoEdit() {
    const pending = !!(ui.textTimer || (ui.text && (ui.textDirty || ui.textBlocked)));
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
    }
    ui.textDirty = false;
    ui.textBlocked = false;
    ui.textError = "";
    if (!ui.future.length) {
      if (pending) refreshTextFromAbc();
      return;
    }
    const current = snapshot();
    ui.past.push(current);
    if (ui.past.length > HISTORY_LIMIT) ui.past.shift();
    restoreSnapshot(ui.future.pop());
  }

  function run(command) {
    if (ui.textTimer) {
      clearTimeout(ui.textTimer);
      ui.textTimer = 0;
      applyText();
    }
    if (ui.textBlocked) {
      setStatus(ui.textError || m('jpFixTextFirst'));
      return false;
    }
    clearSavedNote();
    stopPlayback();
    const barField = ui.tools && document.activeElement && ui.tools.contains(document.activeElement)
      ? document.activeElement.getAttribute("data-bars")
      : "";
    pullBarInputs(barField);
    if (command.op !== "reflow" && ui.index < 0) {
      setStatus(m('jpPickNote'));
      return false;
    }
    const next = editScore(ui.abc, Object.assign({
      index: ui.index,
      voice: ui.voice || "Vocal",
      slice: ui.slice || 0,
      diagram: currentDiagram(),
    }, command));
    if (next.error) {
      setStatus(next.error);
      return false;
    }
    if (next.abc !== ui.abc) remember("edit");
    ui.abc = next.abc;
    if (command.index == null) {
      if (next.index != null) ui.index = next.index;
      ui.slice = 0;
    }
    if (next.beats != null) setStatus(m("jpJoinBeats", { count: next.beats }));
    else if (next.leftover) setStatus(m('jpLeftoverSyllables', { count: next.leftover }));
    else setStatus("");
    refreshTextFromAbc();
    renderScore();
    followSelection();
    if (next.beats != null) setStatus(m("jpJoinBeats", { count: next.beats }));
    else if (next.leftover && ui.status && !ui.status.textContent) {
      setStatus(m('jpLeftoverSyllables', { count: next.leftover }));
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
    if (!known) setStatus(m('jpLoadingPiano'));
    const loading = window.yuePiano.prepare ? window.yuePiano.prepare(ctx) : Promise.resolve(null);
    Promise.resolve(loading).then(function (voice) {
      if (!known && ui.status && ui.status.textContent === m('jpLoadingPiano')) {
        setStatus(voice && voice.kind === "synthetic" ? m('jpSynthFallback') : previous);
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
      return m('jpPlayHintAudio');
    }
    return m('jpPlayHint');
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
    ui.statusSticky = false; setStatus(playHint());
  }

  function setPlayLabel(state) {
    if (!ui.root) return;
    const button = ui.root.querySelector("[data-act='play']");
    if (!button) return;
    const playing = state === "pause" || state === true;
    ui.playing = playing;
    button.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    button.setAttribute("aria-label", playing ? m("jpPause") : m("jpPlay"));
    button.setAttribute("aria-pressed", playing ? "true" : "false");
    button.title = playing ? m("jpPause") : m("jpPlay");
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
      if (followsScore(ui.transport)) followSourceScroll(at);
      const vocal = followMark(marks, at);
      if (!vocal) {
        ui.playKey = "";
        return;
      }
      ui.playKey = vocal.voice + ":" + vocal.index + ":" + vocal.slice;
      return;
    }
    if (followsScore(ui.transport)) followSourceScroll(at);
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
    setPlayLabel("play");
    setStatus(message);
  }

  function ensureAudio() {
    if (!ui.audioUrl || typeof Audio === "undefined") return null;
    if (ui.audio) return ui.audio;
    let audio;
    try {
      audio = new Audio(ui.audioUrl);
    } catch (err) {
      abandonSource(m('jpSourceFail'));
      return null;
    }
    audio.preload = "auto";
    audio.addEventListener("error", () => {
      if (ui.audio !== audio || !ui.audioUrl) return;
      abandonSource(m('jpSourceFail'));
    });
    audio.addEventListener("ended", () => {
      if (ui.audio !== audio) return;
      ui.generation += 1;
      if (ui.raf) cancelAnimationFrame(ui.raf);
      ui.raf = 0;
      setPlayLabel("play");
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

  // Selection is the score clock: toolbar time and play-from-here both follow it.
  function followSelection() {
    if (ui.index < 0) return;
    const marks = ui.marks && ui.marks.length ? ui.marks : playMarks(ui.abc);
    ui.marks = marks;
    const time = markTime(marks, ui.voice || "Vocal", ui.index, ui.slice || 0);
    if (time == null) return;
    const score = timeline(ui.abc);
    const midiTotal = score.error || !score.notes.length
      ? (ui.midiTotal || 0)
      : score.notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
    ui.midiOffset = time;
    ui.midiTotal = midiTotal;
    const midiLive = ui.midiPlaying || ui.arming;
    const sourceLive = !!(ui.audio && !ui.audio.paused && !ui.audio.ended);
    let total = midiTotal;
    if (ui.transport === "source" && ui.audio && Number.isFinite(ui.audio.duration) && ui.audio.duration > 0) {
      total = ui.audio.duration;
    }
    setPlayClock(time, total);
    if (ui.audioUrl) {
      const audio = ui.audio || ensureAudio();
      if (audio) {
        const apply = () => {
          if (ui.audio !== audio) return;
          try { audio.currentTime = time; } catch (err) { return; }
          ui.sourceTouched = true;
          if (!midiLive) {
            paintPlayhead(time);
            const audioTotal = Number.isFinite(audio.duration) && audio.duration > 0
              ? audio.duration
              : total;
            setPlayClock(time, audioTotal);
          }
        };
        if (audio.readyState >= 1) apply();
        else audio.addEventListener("loadedmetadata", apply, { once: true });
      }
    }
    if (midiLive) {
      playMidiFrom(time);
      return;
    }
    if (!sourceLive) paintPlayhead(time);
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
      setPlayLabel("play");
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
        abandonSource(m('jpSourceFail'));
      });
    }
    setPlayLabel("pause");
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
    clearSourceScroll();
    silenceMidi();
    if (ui.audio) {
      ui.audio.pause();
      try { ui.audio.currentTime = 0; } catch (err) { /* not seekable yet */ }
    }
    ui.sourceTouched = false;
    heads().forEach((el) => el.classList.remove("yue-play"));
    clearPlayhead();
    setPlayLabel("play");
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
    setPlayLabel("play");
    if (ui.midiTotal > 0) {
      setPlayClock(ui.midiOffset, ui.midiTotal);
      paintPlayhead(ui.midiOffset);
    }
  }

  function playMidiFrom(position) {
    const score = timeline(ui.abc);
    if (score.error || !score.notes.length) {
      setStatus(score.error || m('jpNoPlayable'));
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      setStatus(m('jpNoMidiBrowser'));
      return;
    }
    if (!window.yuePiano) {
      setStatus(m('jpPianoMissing'));
      return;
    }
    const total = score.notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
    let offset = Math.max(0, position || 0);
    if (offset >= Math.max(0.02, total - 0.02)) offset = 0;
    silenceMidi();
    if (ui.raf) cancelAnimationFrame(ui.raf);
    ui.raf = 0;
    ui.ctx = ui.ctx || new AudioCtx();
    if (ui.ctx.state === "suspended" && ui.ctx.resume) ui.ctx.resume();
    ui.arming = true;
    ui.midiTotal = total;
    setPlayLabel("pause");
    const known = window.yuePiano.voice && window.yuePiano.voice(ui.ctx);
    if (!known) setStatus(m('jpLoadingPiano'));
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
      setStatus(voice && voice.kind === "synthetic" ? m('jpSynthFallback') : playHint());
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
        followSourceScroll(now);
        const mark = cursorAt(marks, Math.max(0, now));
        const playKey = mark ? mark.voice + ":" + mark.index + ":" + mark.slice : "";
        if (playKey !== ui.playKey) {
          const node = headFor(mark);
          if (node) {
            ui.playKey = playKey;
            drawPlayhead(node);
          }
        }
        if (now < total - 0.02) ui.raf = requestAnimationFrame(tick);
        else stopPlayback();
      };
      setPlayLabel("pause");
      tick();
    }).catch(function (err) {
      if (ui.generation !== generation) return;
      ui.arming = false;
      ui.midiPlaying = false;
      setPlayLabel("play");
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
    if (options && options.strings) setStrings(options.strings);
    else applyChrome();
    stopPlayback();
    stopSaveWatch();
    ui.saveButton = options && options.saveButton || null;
    ui.saveNote = options && options.saveNote || null;
    ui.songTitle = options && options.title ? String(options.title).trim() : "";
    ui.savedNote = false;
    ui.savedSticky = false;
    ui.view = "jianpu";
    attachSource(audioFile);
    ui.transport = playbackTransport(!!ui.audioUrl, "source");
    syncTransport();
    if (ui.resolve) ui.resolve(null);
    return new Promise((resolve) => {
      ui.sourceAbc = String(abc || "");
      ui.abc = ui.sourceAbc;
      ui.past = [];
      ui.future = [];
      ui.textBurst = 0;
      ui.restoring = false;
      syncHistoryButtons();
      ui.chordKey = "";
      ui.textDirty = false;
      ui.textBlocked = false;
      ui.textError = "";
      ui.index = -1;
      ui.voice = "Vocal";
      ui.slice = 0;
      refreshTextFromAbc();
      ui.resolve = resolve;
      ui.statusSticky = false;
      setStatus(playHint());
      if (ui.clock) ui.clock.textContent = "0:00";
      ui.root.hidden = false;
      ui.textVisible = readSavedTextVisible();
      syncTextVisible();
      syncLeadButton();
      if (ui.textVisible !== false) applyTextWidth(readSavedTextWidth(), false);
      if (ui.diagram) {
        ui.diagram.setAttribute("data-diagram", readSavedDiagram());
        syncDiagram();
      }
      ensureJianpu().then((ok) => {
        if (ui.resolve !== resolve) return;
        if (!ok) {
          ui.paper.innerHTML = '<p>' + m('jpModuleMissing') + '</p>';
          return;
        }
        renderScore();
      }).catch(() => {
        if (ui.resolve !== resolve) return;
        ui.paper.innerHTML = '<p>' + m('jpModuleMissing') + '</p>';
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
    chordsInKey: chordsInKey,
    chordKeyNames: chordKeyNames,
    capoFret: capoFret,
    keyLegend: keyLegend,
    withKeyLegend: withKeyLegend,
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
    leadSheet: leadSheet,
    leadSheetDocument: leadSheetDocument,
    embedPdfFonts: embedPdfFonts,
    rewriteCjkFonts: rewriteCjkFonts,
    parseTitle: parseTitle,
    displayTitle: displayTitle,
    withDisplayTitle: withDisplayTitle,
    jianpuSvgParts: jianpuSvgParts,
    parseJianpuText: parseJianpuText,
    alignLyricsAfter: alignLyricsAfter,
    textMarkFor: textMarkFor,
    textSpanFor: textSpanFor,
    lyricIndexesInSelection: lyricIndexesInSelection,
    textScrollTarget: textScrollTarget,
    centerScroll: centerScroll,
    sourceScrollTop: sourceScrollTop,
    easeScrollStep: easeScrollStep,
    compareJianpuNotes: compareJianpuNotes,
    clampTextWidth: clampTextWidth,
    open: open,
    setStrings: setStrings,
    applyChrome: applyChrome,
    currentAbc: currentAbc,
    saved: reportSaved,
  };
});
