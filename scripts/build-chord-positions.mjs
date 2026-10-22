/**
 * Build app/public/score/abc2svg/chord-positions.js from chords-db.
 * Usage: node scripts/build-chord-positions.mjs [path-to-chords-db]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dbRoot = process.argv[2]
  || path.join(process.env.TEMP || "/tmp", "chords-db");
const require = createRequire(import.meta.url);

const ROOT_MAP = {
  C: "C",
  Csharp: "C#",
  "C#": "C#",
  Db: "C#",
  D: "D",
  Eb: "D#",
  "D#": "D#",
  E: "E",
  F: "F",
  Fsharp: "F#",
  "F#": "F#",
  Gb: "F#",
  G: "G",
  Ab: "G#",
  "G#": "G#",
  A: "A",
  Bb: "A#",
  "A#": "A#",
  B: "B",
};

const BASS_MAP = {
  C: "C",
  "C#": "C#",
  Db: "C#",
  D: "D",
  "D#": "D#",
  Eb: "D#",
  E: "E",
  F: "F",
  "F#": "F#",
  Gb: "F#",
  G: "G",
  "G#": "G#",
  Ab: "G#",
  A: "A",
  "A#": "A#",
  Bb: "A#",
  B: "B",
};

/** chords-db suffix → quality part of the diag key (before optional .bass). */
function qualityOf(suffix) {
  if (suffix === "major") return "";
  if (suffix === "minor") return "m";
  if (suffix === "sus") return "sus4";
  if (suffix === "maj7") return "M7";
  if (suffix === "aug7") return "+7";
  // diag-1.js stores min+7 / mmaj7 under m(maj7).
  if (suffix === "mmaj7") return "m(maj7)";
  // Slash / bass forms: "m/G", "7/G", "m9/Bb", "/G"
  const slash = suffix.match(/^([^/]*)\/(.+)$/);
  if (slash) {
    const head = slash[1];
    const bass = BASS_MAP[slash[2]] || slash[2];
    let quality = head;
    if (head === "") quality = "";
    else if (head === "m") quality = "m";
    else if (head === "maj7") quality = "M7";
    else if (head === "aug7") quality = "+7";
    else if (head === "sus") quality = "sus4";
    else if (head === "mmaj7") quality = "m(maj7)";
    return { quality, bass };
  }
  return suffix;
}

function shapeKey(rootKey, suffix) {
  const root = ROOT_MAP[rootKey];
  if (!root) throw new Error("unknown root " + rootKey);
  const q = qualityOf(suffix);
  if (typeof q === "object") {
    return root + q.quality + "." + q.bass;
  }
  return root + q;
}

function fretChar(n) {
  if (n < 0) return "x";
  if (n <= 9) return String(n);
  return String.fromCharCode("a".charCodeAt(0) + (n - 10));
}

/**
 * Convert one chords-db position to a diag frets string, or null if it
 * cannot fit the 4-fret diagram window.
 */
function positionToDiag(pos, strings) {
  const frets = pos.frets;
  const fingers = pos.fingers || frets.map(() => 0);
  if (!Array.isArray(frets) || frets.length !== strings) return null;
  const base = Number(pos.baseFret) || 1;
  // Relative frets must sit in 0 (open) or 1–4.
  for (const f of frets) {
    if (f === -1) continue;
    if (base === 1) {
      if (f < 0 || f > 4) return null;
    } else {
      if (f < 1 || f > 4) return null;
    }
  }
  const fretPart = frets.map((f) => (f === -1 ? "x" : fretChar(f))).join("");
  const fingerPart = frets
    .map((f, i) => (f === -1 ? "x" : fretChar(fingers[i] || 0)))
    .join("");
  const mid = base === 1 ? ",0" : "fr" + base;
  let out = fretPart + " " + mid + " " + fingerPart;
  const barres = Array.isArray(pos.barres)
    ? pos.barres
    : pos.barres != null
      ? [pos.barres]
      : [];
  for (const barreFret of barres) {
    const idxs = [];
    for (let i = 0; i < strings; i++) {
      if (frets[i] === barreFret && fingers[i] === 1) idxs.push(i);
    }
    // Outer span of finger-1 at the barre fret (gaps from other fingers ok).
    if (idxs.length < 2) continue;
    const bestLo = Math.min(...idxs);
    const bestHi = Math.max(...idxs);
    // String numbers: 1 = highest (rightmost), strings = lowest (leftmost).
    const highNum = strings - bestHi;
    const lowNum = strings - bestLo;
    out += " barre=" + lowNum + "-" + highNum;
    break;
  }
  return out;
}

// Self-check (no chords-db): Bm7 open barre + A E-shape at fr5.
{
  const bm7 = positionToDiag(
    { frets: [2, 2, 4, 2, 3, 2], fingers: [1, 1, 3, 1, 2, 1], barres: 2 },
    6,
  );
  const aBarre = positionToDiag(
    {
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: 1,
      baseFret: 5,
    },
    6,
  );
  if (bm7 !== "224232 ,0 113121 barre=6-1") {
    throw new Error("barre self-check Bm7: got " + bm7);
  }
  if (aBarre !== "133211 fr5 134211 barre=6-1") {
    throw new Error("barre self-check A: got " + aBarre);
  }
}

function buildInstrument(json, strings) {
  const out = {};
  for (const rootKey of Object.keys(json.chords)) {
    for (const chord of json.chords[rootKey]) {
      const key = shapeKey(rootKey, chord.suffix);
      const list = [];
      const seen = new Set();
      for (const pos of chord.positions || []) {
        const diag = positionToDiag(pos, strings);
        if (!diag) continue;
        if (seen.has(diag)) continue;
        seen.add(diag);
        list.push(diag);
      }
      if (!list.length) continue;
      if (!out[key]) out[key] = list;
      else {
        // Merge if the same key appears twice (should not for one root).
        for (const d of list) {
          if (!out[key].includes(d)) out[key].push(d);
        }
      }
    }
  }
  return out;
}

function loadDiagTables() {
  const src = fs.readFileSync(
    path.join(root, "app/public/score/abc2svg/diag-1.js"),
    "utf8",
  );
  // Evaluate in a sandbox that captures abc2svg.diag.
  const abc2svg = { modules: { hooks: { push() {} } } };
  const fn = new Function("abc2svg", src + "\nreturn abc2svg.diag;");
  return fn(abc2svg);
}

function fretsOf(diagStr) {
  return String(diagStr || "").split(" ")[0] || "";
}

function compareFirst(name, built, table) {
  const mismatches = [];
  const missing = [];
  for (const key of Object.keys(table)) {
    const expected = table[key];
    const list = built[key];
    if (!list || !list.length) {
      missing.push(key);
      continue;
    }
    if (fretsOf(list[0]) !== fretsOf(expected)) {
      mismatches.push({
        key,
        expected: expected,
        got: list[0],
      });
    }
  }
  console.log(
    name + ": table keys",
    Object.keys(table).length,
    "built keys",
    Object.keys(built).length,
    "missing",
    missing.length,
    "fret mismatches",
    mismatches.length,
  );
  if (missing.length) console.log("  missing sample", missing.slice(0, 20));
  if (mismatches.length) {
    console.log("  mismatch sample");
    for (const m of mismatches.slice(0, 25)) {
      console.log("   ", m.key, "want", m.expected, "got", m.got);
    }
  }
  return { mismatches, missing };
}

const guitar = require(path.join(dbRoot, "lib/guitar.json"));
const ukulele = require(path.join(dbRoot, "lib/ukulele.json"));
const guitarPos = buildInstrument(guitar, 6);
const ukePos = buildInstrument(ukulele, 4);
const diag = loadDiagTables();
const gCmp = compareFirst("guitar", guitarPos, diag.cd6);
const uCmp = compareFirst("ukulele", ukePos, diag.cd4);

// For keys that mismatch or are missing, keep the table's first shape as
 // position[0] and append any extra built positions that differ.
function reconcile(built, table) {
  const out = { ...built };
  for (const key of Object.keys(table)) {
    const stock = table[key];
    const list = out[key] ? out[key].slice() : [];
    if (!list.length) {
      out[key] = [stock];
      continue;
    }
    if (fretsOf(list[0]) !== fretsOf(stock)) {
      // Prefer the shipped diagram as the default; keep others after.
      const rest = list.filter((d) => fretsOf(d) !== fretsOf(stock));
      out[key] = [stock, ...rest];
    }
  }
  return out;
}

const guitarFinal = reconcile(guitarPos, diag.cd6);
const ukeFinal = reconcile(ukePos, diag.cd4);
compareFirst("guitar-final", guitarFinal, diag.cd6);
compareFirst("ukulele-final", ukeFinal, diag.cd4);

function emitObject(obj, indent) {
  const pad = "  ".repeat(indent);
  const pad2 = "  ".repeat(indent + 1);
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b, "en"));
  const lines = ["{"];
  for (const key of keys) {
    const list = obj[key];
    const keyLit = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
    lines.push(pad2 + keyLit + ": " + JSON.stringify(list) + ",");
  }
  // drop trailing comma on last — keep for simplicity / valid in modern JS
  if (lines.length > 1) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, "");
  }
  lines.push(pad + "}");
  return lines.join("\n");
}

const outPath = path.join(root, "app/public/score/abc2svg/chord-positions.js");
const body = `// Chord diagram positions for Yue Studio's jianpu editor.
// Chord shapes from tombatossals/chords-db (MIT):
// https://github.com/tombatossals/chords-db
// Regenerated by scripts/build-chord-positions.mjs — do not hand-edit.
// Each value is an array of diag frets strings (same encoding as diag-1.js).
// Index 0 matches the default shape in abc2svg.diag.cd6 / cd4.
if (typeof abc2svg === "undefined") var abc2svg = {};
abc2svg.chordPositions = {
  guitar: ${emitObject(guitarFinal, 1)},
  ukulele: ${emitObject(ukeFinal, 1)}
};
`;
fs.writeFileSync(outPath, body);
console.log("wrote", outPath, "bytes", body.length);
console.log(
  "guitar chords",
  Object.keys(guitarFinal).length,
  "ukulele",
  Object.keys(ukeFinal).length,
);
if (gCmp.mismatches.length || uCmp.mismatches.length) {
  console.log(
    "Note: some first shapes were reconciled to match diag-1.js stock tables.",
  );
}
