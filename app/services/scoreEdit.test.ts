import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jianpuStrings } from '../i18n/jianpu';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(path.join(here, '../public/score/score_edit.js'));

const editor = (globalThis as { yueScoreEditor?: {
  buildJianpuText: (abc: string) => { text: string; error?: string | null };
  parseJianpuText: (text: string, baseAbc: string) => {
    abc: string | null;
    warning: string | null;
    error: string | null;
    line?: number;
  };
  alignLyricsAfter: (text: string, baseAbc: string, caret: number) => {
    text: string | null;
    abc: string | null;
    error: string | null;
    none: boolean;
    caret: number;
    leftover: number;
  };
  editScore: (abc: string, command: Record<string, unknown>) => {
    abc: string;
    error?: string | null;
    beats?: number | null;
  };
  compareJianpuNotes: (text: string, svg: string, beat: number, lDen: number, perBar: number) => { ok: boolean; message: string };
  sourceScrollTop: (
    anchors: Array<{ t: number; y: number }>,
    now: number,
    viewHeight: number,
    maxScroll: number,
  ) => number;
  easeScrollStep: (
    shown: number,
    target: number,
    dt: number,
    tau: number,
    snap: number,
  ) => number;
  playMarks: (abc: string) => Array<{ voice: string; index: number; slice: number; start: number }>;
  markTime: (
    marks: Array<{ voice: string; index: number; slice: number; start: number }>,
    voice: string,
    index: number,
    slice: number,
  ) => number | null;
  setStrings?: (next: Record<string, string>) => void;
  open?: (abc: string, audio: string | null, options?: { strings?: Record<string, string> }) => Promise<string | null>;
} }).yueScoreEditor!;

const ABC = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% verse
V: Vocal
"C"C4D4E4F4|G4A4B4c4|
V: Ins
Z2|
`;

function zeros(voice: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `<text class="fj v-${voice}" x="${i * 20}" y="10">0</text>`).join('');
}

describe('vendored jianpu editScore', () => {
  it('keeps a mid-score meter when only the lyric text changes', () => {
    const score = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% verse
V: Vocal
C4D4E4F4|
w: 春 天
V: Ins
z16|
% outro
V: Vocal
M:2/4
C4D4|
w: 夏
V: Ins
M:2/4
z8|
`;
    const built = editor.buildJianpuText(score);
    expect(built.error).toBeFalsy();
    expect(built.text).toContain('\n2/4\n');
    const lyric = built.text.replace('夏', '秋');
    const parsed = editor.parseJianpuText(lyric, score);
    expect(parsed.error).toBeFalsy();
    expect(parsed.warning).toBeFalsy();
    expect(parsed.abc).toContain('M:2/4');
    expect(parsed.abc).toContain('w: 秋');
    expect(parsed.abc).toMatch(/^M:4\/4$/m);
  });

  it('changes the first vocal degree', () => {
    const edited = editor.editScore(ABC, { voice: 'Vocal', op: 'degree', index: 0, degree: 5 });
    expect(edited.error).toBeFalsy();
    expect(edited.abc).toContain('"C"G4D4E4F4|');
  });

  it('accepts a rest run that mixes one 0 per bar with a sliced whole rest', () => {
    editor.setStrings?.(jianpuStrings.zh as unknown as Record<string, string>);
    const text = [
      '1=C  4/4  ♩=120',
      '伴',
      '0 - - - | 0 - - - | 0 - - - | 0 - - - | 0 - - - | 0 - - - | 0 - - - |',
    ].join('\n');
    const mixed = editor.compareJianpuNotes(text, zeros('Ins', 10), 4, 16, 16);
    expect(mixed.ok).toBe(true);
    const short = editor.compareJianpuNotes(text, zeros('Ins', 2), 4, 16, 16);
    expect(short.ok).toBe(false);
    expect(short.message).toContain('28 个 0');
    expect(short.message).toContain('2 个 0');
  });

  it('names the line, bar, and notes when a tie does not match', () => {
    editor.setStrings?.(jianpuStrings.zh as unknown as Record<string, string>);
    const header = '1=C  4/4  ♩=120';
    const bad = [header, '唱', '1 2 3 4 |', '伴', '0 - - - |', '唱', '5~ 6 5 5 |', '伴', '0 - - - |'].join('\n');
    const parsed = editor.parseJianpuText(bad, ABC);
    expect(parsed.error).toBeFalsy();
    expect(parsed.warning).toContain('第 7 行');
    expect(parsed.warning).toContain('唱');
    expect(parsed.warning).toContain('第 1 小节');
    expect(parsed.warning).toContain('5~');
    expect(parsed.warning).toContain('6');
    const same = [header, '唱', '5~ 5 6 5 |', '伴', '0 - - - |'].join('\n');
    expect(editor.parseJianpuText(same, ABC).warning).toBeFalsy();
    const ended = [header, '唱', '5~ - - - |', '伴', '0 - - - |'].join('\n');
    const endWarn = editor.parseJianpuText(ended, ABC).warning || '';
    expect(endWarn).toContain('第 3 行');
    expect(endWarn).toContain('5~');
    expect(endWarn).toContain('没有音');
    const ins = [header, '唱', '0 - - - |', '伴', '1~ 2 3 4 |'].join('\n');
    const insWarn = editor.parseJianpuText(ins, ABC).warning || '';
    expect(insWarn).toContain('第 5 行');
    expect(insWarn).toContain('伴');
    expect(insWarn).toContain('1~');
    expect(insWarn).toContain('2');
  });

  it('names the line when a mark cannot be read', () => {
    editor.setStrings?.(jianpuStrings.zh as unknown as Record<string, string>);
    const text = ['1=C  4/4  ♩=120', '唱', '1 |', '土'].join('\n');
    const result = editor.compareJianpuNotes(
      text,
      '<text class="fj v-Vocal" x="0" y="10">1</text>',
      4, 16, 16,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('第 4 行');
    expect(result.message).toContain('土');
  });

  it('skips a meter line when comparing notes', () => {
    editor.setStrings?.(jianpuStrings.zh as unknown as Record<string, string>);
    const text = ['1=C  4/4  ♩=120', '% verse', '2/4', '唱', '1 |', '伴', '0 |'].join('\n');
    const svg = [
      '<text class="fj v-Vocal" x="0" y="10">1</text>',
      '<text class="fj v-Ins" x="0" y="30">0</text>',
    ].join('');
    const result = editor.compareJianpuNotes(text, svg, 4, 16, 16);
    expect(result.ok).toBe(true);
    expect(result.message).not.toContain('要写在唱或伴下面');
  });

  it('interpolates source scroll between row anchors', () => {
    expect(editor.sourceScrollTop([], 1, 200, 500)).toBe(0);
    const anchors = [
      { t: 0, y: 100 },
      { t: 10, y: 300 },
    ];
    expect(editor.sourceScrollTop(anchors, -1, 200, 500)).toBe(Math.max(0, 100 - 200 * 0.35));
    expect(editor.sourceScrollTop(anchors, 0, 200, 500)).toBe(Math.max(0, 100 - 200 * 0.35));
    expect(editor.sourceScrollTop(anchors, 5, 200, 500)).toBe(Math.max(0, 200 - 200 * 0.35));
    expect(editor.sourceScrollTop(anchors, 10, 200, 500)).toBe(Math.max(0, 300 - 200 * 0.35));
    expect(editor.sourceScrollTop(anchors, 99, 200, 500)).toBe(Math.max(0, 300 - 200 * 0.35));
    expect(editor.sourceScrollTop(anchors, 5, 200, 40)).toBe(40);
  });

  it('eases source scroll toward the target', () => {
    expect(editor.easeScrollStep(0, 400, 0.016, 0.16, 200)).toBe(400);
    const step = editor.easeScrollStep(100, 200, 0.016, 0.16, 400);
    expect(step).toBeGreaterThan(100);
    expect(step).toBeLessThan(120);
    const settled = editor.easeScrollStep(100, 200, 2, 0.16, 400);
    expect(settled).toBeGreaterThan(199);
    expect(settled).toBeLessThanOrEqual(200);
  });

  it('opens with English chrome', async () => {
    const globals = globalThis as { abc2svg?: unknown };
    const previous = globals.abc2svg;
    globals.abc2svg = { Abc() {}, jianpu: {}, diag: {} };
    try {
      const pending = editor.open?.(ABC, null, { strings: jianpuStrings.en as unknown as Record<string, string> });
      await Promise.resolve();
      expect(document.querySelector('.yue-jp-editor h2')?.textContent).toBe('Edit jianpu');
      const align = document.querySelector('.yue-jp-editor [data-act="align-lyrics"]') as HTMLButtonElement | null;
      expect(align?.querySelector('svg')).toBeTruthy();
      expect(align?.getAttribute('aria-label')).toBe('Align lyrics');
      (document.querySelector('.yue-jp-editor [data-act="cancel"]') as HTMLButtonElement | null)?.click();
      await pending;
    } finally {
      document.querySelector('.yue-jp-editor')?.remove();
      globals.abc2svg = previous;
    }
  });

  it('switches toolbars between lyric and score caret', async () => {
    const globals = globalThis as { abc2svg?: unknown };
    const previous = globals.abc2svg;
    globals.abc2svg = { Abc() {}, jianpu: {}, diag: {} };
    const score = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C4D4E4F4|
w: 春 天 啊 来
V: Ins
z16|
`;
    try {
      const pending = editor.open?.(score, null, { strings: jianpuStrings.zh as unknown as Record<string, string> });
      await Promise.resolve();
      const text = document.querySelector('.yue-jp-editor textarea') as HTMLTextAreaElement | null;
      expect(text).toBeTruthy();
      const tools = document.querySelector('.yue-jp-editor .yue-jp-tools') as HTMLElement | null;
      expect(tools).toBeTruthy();

      const spring = text!.value.indexOf('春');
      expect(spring).toBeGreaterThan(-1);
      text!.focus();
      text!.setSelectionRange(spring, spring + 1);
      text!.dispatchEvent(new Event('select'));

      expect(tools!.hidden).toBe(false);
      const lyricGroup = tools!.querySelector('.yue-jp-group[data-for="lyrics"]') as HTMLElement | null;
      expect(lyricGroup?.hidden).toBe(false);
      const lyricEmpty = lyricGroup?.querySelector('[data-act="lyric-empty"]') as HTMLButtonElement | null;
      expect(lyricEmpty?.textContent).toBe('·');
      const lyricSustain = lyricGroup?.querySelector('[data-act="lyric-sustain"]') as HTMLButtonElement | null;
      expect(lyricSustain).toBeTruthy();
      expect(lyricGroup?.querySelector('[data-act="align-lyrics"]')).toBeTruthy();
      tools!.querySelectorAll('.yue-jp-group[data-for="score"]').forEach((group) => {
        expect((group as HTMLElement).hidden).toBe(true);
      });

      const before = text!.value;
      lyricEmpty!.click();
      expect(text!.value).toMatch(/词[^\n]*·/);
      lyricSustain!.click();
      expect(text!.value).not.toBe(before);
      expect(text!.value).toMatch(/词[^\n]*-/);

      const lines = text!.value.split('\n');
      let musicAt = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== '唱') continue;
        const body = lines[i + 1] || '';
        const digit = body.search(/[1-7]/);
        if (digit < 0) continue;
        musicAt = lines.slice(0, i + 1).join('\n').length + 1 + digit;
        break;
      }
      expect(musicAt).toBeGreaterThan(-1);
      text!.setSelectionRange(musicAt, musicAt + 1);
      text!.dispatchEvent(new Event('select'));

      expect(tools!.hidden).toBe(false);
      expect(lyricGroup?.hidden).toBe(true);
      const degree = tools!.querySelector('[data-degree="1"]') as HTMLElement | null;
      expect(degree).toBeTruthy();
      expect((degree!.closest('.yue-jp-group') as HTMLElement).hidden).toBe(false);

      (document.querySelector('.yue-jp-editor [data-act="cancel"]') as HTMLButtonElement | null)?.click();
      await pending;
    } finally {
      document.querySelector('.yue-jp-editor')?.remove();
      globals.abc2svg = previous;
    }
  });

  it('flows lyrics after the caret across vocal lines', () => {
    editor.setStrings?.(jianpuStrings.zh as unknown as Record<string, string>);
    const score = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% verse
V: Vocal
C4D4E4F4|
w: 春 天 啊 来
V: Ins
z16|
% next
V: Vocal
G4A4B4c4|
w: 了 花
V: Ins
z16|
`;
    const built = editor.buildJianpuText(score);
    expect(built.error).toBeFalsy();
    // Misaligned: 了 sits past the first line's notes; 花 alone on the next line.
    const text = (built.text || '')
      .replace('词 春 天 啊 来', '词 春 天 啊 来 了')
      .replace('词 了 花', '词 花');
    const ah = text.indexOf('啊');
    expect(ah).toBeGreaterThan(-1);
    const caret = ah + '啊'.length;
    const aligned = editor.alignLyricsAfter(text, score, caret);
    expect(aligned.error).toBeFalsy();
    expect(aligned.none).toBe(false);
    expect(aligned.text).toContain('词 春 天 啊 来');
    expect(aligned.text).toContain('词 了 花');
    expect(aligned.abc).toMatch(/w:\s*春 天 啊 来/);
    expect(aligned.abc).toMatch(/w:\s*了 花/);
  });

  it('drops empty lyric slots from the pool and keeps melisma dashes', () => {
    editor.setStrings?.(jianpuStrings.zh as unknown as Record<string, string>);
    const score = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C4D4E4F4|
w: 春 * - 天
V: Ins
z16|
`;
    const built = editor.buildJianpuText(score);
    const text = (built.text || '').replace('词 春 · - 天', '词 春 · - 花 开 啦');
    const parsed = editor.parseJianpuText(text, score);
    expect(parsed.error).toBeFalsy();
    const spring = text.indexOf('春');
    const caret = spring + '春'.length;
    const aligned = editor.alignLyricsAfter(text, score, caret);
    expect(aligned.error).toBeFalsy();
    expect(aligned.none).toBe(false);
    // · is skipped; - stays as one slot; 开 啦 outrun the three remaining notes.
    expect(aligned.text).toMatch(/词 春 - 花 开/);
    expect(aligned.leftover).toBe(1);
  });

  it('reports leftover syllables when the pool outruns the notes', () => {
    editor.setStrings?.(jianpuStrings.zh as unknown as Record<string, string>);
    const score = `X:1
T:
M:2/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C4D4|
w: 春
V: Ins
z8|
`;
    const built = editor.buildJianpuText(score);
    const text = (built.text || '').replace('词 春', '词 春 天 啊 来');
    const caret = text.indexOf('词') + 1;
    const aligned = editor.alignLyricsAfter(text, score, caret);
    expect(aligned.error).toBeFalsy();
    expect(aligned.leftover).toBe(2);
    expect(aligned.abc).toMatch(/w:\s*春 天/);
  });

  it('maps the second quarter at 120bpm to 0.5s', () => {
    // L:1/16 so C4 is one quarter; Q:1/4=120 → 0.5s per quarter.
    const marks = editor.playMarks(ABC);
    expect(editor.markTime(marks, 'Vocal', 0, 0)).toBe(0);
    expect(editor.markTime(marks, 'Vocal', 1, 0)).toBe(0.5);
  });

  it('reports the text-score line of a bad token', () => {
    editor.setStrings?.(jianpuStrings.en as unknown as Record<string, string>);
    const built = editor.buildJianpuText(ABC);
    const text = `${built.text || ''}\n???`;
    const parsed = editor.parseJianpuText(text, ABC);
    expect(parsed.abc).toBeNull();
    expect(parsed.line).toBe(text.split('\n').length);
    expect(parsed.error).toContain(`Line ${parsed.line}:`);
    expect(parsed.error).toContain('???');
  });

  it('realigns from a vocal note under the caret in the text score', () => {
    editor.setStrings?.(jianpuStrings.zh as unknown as Record<string, string>);
    const score = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C4D4E4F4|
w: 春 天 啊 来
V: Ins
z16|
`;
    const built = editor.buildJianpuText(score);
    // Extra 了 after the line; caret on the third degree pulls 啊 来 了 from there.
    const text = (built.text || '').replace('词 春 天 啊 来', '词 春 天 啊 来 了');
    const musicLine = text.split('\n').find((line) => /(?:^|\s)1\s+2\s+3\s+4\s*\|/.test(line));
    expect(musicLine).toBeTruthy();
    const lineStart = text.indexOf(musicLine!);
    const digit = musicLine!.indexOf('3');
    expect(digit).toBeGreaterThan(-1);
    const aligned = editor.alignLyricsAfter(text, score, lineStart + digit);
    expect(aligned.error).toBeFalsy();
    expect(aligned.none).toBe(false);
    expect(aligned.text).toMatch(/词 春 天 啊 来/);
    expect(aligned.leftover).toBe(1);
  });

  it('makes the selected beat the first beat of the next bar', () => {
    const score = `X:1
T:
M:4/4
L:1/4
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% verse
V: Vocal
C D E F|G A B c|d e f g|
w: do re mi fa so la ti do re mi fa so
V: Ins
C D E F|G A B c|d e f g|
% chorus
V: Vocal
c B A G|
w: end
V: Ins
c B A G|
V: Vocal
M:3/4
E F G|
V: Ins
M:3/4
E F G|
`;
    const packed = (abc: string) => abc.replace(/\s+/g, '');
    const moved = editor.editScore(score, { op: 'downbeat', index: 5, voice: 'Vocal' });
    expect(moved.error).toBeFalsy();
    const body = packed(moved.abc);
    expect(body).toContain('V:VocalCDEF|G|ABcd|efg|');
    expect(body).toContain('w:doremifasolatidoremifaso');
    expect(body).toContain('V:InsCDEF|G|ABcd|efg|');
    expect(body).toContain('%chorus');
    expect(body).toContain('cBAG|');
    expect(body).toContain('M:3/4');
    expect(body).toContain('EFG|');
    const stayed = editor.editScore(score, { op: 'downbeat', index: 4, voice: 'Vocal' });
    expect(stayed.error).toBeTruthy();
    expect(stayed.abc).toBe(score);
  });

  it('ties a note split by the new bar and keeps the lyric on the first half', () => {
    const score = `X:1
T:
M:4/4
L:1/4
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C D E F|G A4|
w: do re mi fa so la
V: Ins
C D E F|G A4|
`;
    const moved = editor.editScore(score, { op: 'downbeat', index: 3, voice: 'Vocal' });
    expect(moved.error).toBeFalsy();
    const body = moved.abc.replace(/\s+/g, '');
    expect(body).toContain('CDE|FGA2-|A2|');
    expect(body).toContain('w:doremifasola');
    expect(moved.index).toBe(3);
  });

  it('repacks sparse and dense bars onto lines without crossing section or meter breaks', () => {
    const score = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% verse
V: Vocal
C16|
w: a
V: Ins
C16|
V: Vocal
D16|
w: b
V: Ins
D16|
V: Vocal
E16|
w: c
V: Ins
E16|
V: Vocal
F16|
w: d
V: Ins
F16|
V: Vocal
G16|
w: e
V: Ins
G16|
V: Vocal
A16|
w: f
V: Ins
A16|
V: Vocal
B16|
w: g
V: Ins
B16|
V: Vocal
c16|
w: h
V: Ins
c16|
% chorus
V: Vocal
CDEF GABc defg abc'd'|
w: one two three four five six seven eight nine ten eleven twelve thir teen fif teen
V: Ins
CDEF GABc defg abc'd'|
V: Vocal
CDEF GABc defg abc'd'|
w: more notes packed tight here now yes
V: Ins
CDEF GABc defg abc'd'|
V: Vocal
M:3/4
C8D8E8|
w: end
V: Ins
M:3/4
C8D8E8|
`;
    const packed = (abc: string) => abc.replace(/\s+/g, '');
    const musicLines = (abc: string, voice: string) =>
      abc.split(/\r?\n/).filter((line, i, lines) => {
        if (!/\|/.test(line) || /^[wW]:/.test(line) || /^%/.test(line)) return false;
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j] === `V: ${voice}`) return true;
          if (/^V:/.test(lines[j])) return false;
        }
        return false;
      });
    const once = editor.editScore(score, { op: 'reflow' });
    expect(once.error).toBeFalsy();
    // Eight whole-note bars pack to two lines of four.
    expect(packed(once.abc)).toContain('C16|D16|E16|F16|');
    expect(packed(once.abc)).toContain('G16|A16|B16|c16|');
    expect(packed(once.abc)).toContain('w:abcd');
    expect(packed(once.abc)).toContain('w:efgh');
    // Dense bars stay one per line (rewritten with spaces between degrees).
    const dense = musicLines(once.abc, 'Vocal').filter((line) => /c'\s*d'/.test(line));
    expect(dense).toHaveLength(2);
    expect(dense.every((line) => (line.match(/\|/g) || []).length === 1)).toBe(true);
    // Section and meter boundaries stay.
    expect(once.abc).toContain('% chorus');
    expect(packed(once.abc)).toContain('M:3/4');
    expect(packed(once.abc)).toMatch(/%chorus[\s\S]*M:3\/4/);
    // Voices share the same cuts.
    const vocalCuts = musicLines(once.abc, 'Vocal').map((line) => (line.match(/\|/g) || []).length);
    const insCuts = musicLines(once.abc, 'Ins').map((line) => (line.match(/\|/g) || []).length);
    expect(insCuts).toEqual(vocalCuts);
    // Second pass is a no-op.
    const twice = editor.editScore(once.abc, { op: 'reflow' });
    expect(twice.error).toBeFalsy();
    expect(packed(twice.abc)).toBe(packed(once.abc));
  });

  it('reflow ignores furigana width so chord bars can share a line', () => {
    const score = `X:1
T:
M:4/4
L:1/16
Q:1/4=75
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:D
V: Vocal
"Em7/G"A2z2B2d2"A7sus4"A2z2B2G2|
w: 目(め)を 閉(と)じ て 風(かぜ) を 感(かん) じ て
V: Ins
A2z2B2d2A2z2B2G2|
V: Vocal
"Dmaj7"d4 z4 A2 d2|
w: 春(はる) の 風(かぜ) を
V: Ins
d4 z4 A2 d2|
V: Vocal
"Em7/G"A2z2d2"A7sus4"A2z2B2G2|
w: また 会(あ) い た い ね
V: Ins
A2z2d2A2z2B2G2|
V: Vocal
"Dmaj7"d4 z4 A2 d2|
w: 今(いま) は 遠(とお) く
V: Ins
d4 z4 A2 d2|
`;
    const musicLines = (abc: string, voice: string) =>
      abc.split(/\r?\n/).filter((line, i, lines) => {
        if (!/\|/.test(line) || /^[wW]:/.test(line) || /^%/.test(line)) return false;
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j] === `V: ${voice}`) return true;
          if (/^V:/.test(lines[j])) return false;
        }
        return false;
      });
    const once = editor.editScore(score, { op: 'reflow', diagram: 'guitar' });
    expect(once.error).toBeFalsy();
    const vocal = musicLines(once.abc, 'Vocal');
    expect(vocal.some((line) => (line.match(/\|/g) || []).length >= 2)).toBe(true);
    expect(vocal.every((line) => (line.match(/\|/g) || []).length <= 4)).toBe(true);
    const again = editor.editScore(once.abc, { op: 'reflow', diagram: 'guitar' });
    expect(again.abc.replace(/\s+/g, '')).toBe(once.abc.replace(/\s+/g, ''));
  });

  it('reflow packs by syllable density: sparse wholes share a line, dense sixteenths stay alone', () => {
    const score = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C16|
w: a
V: Ins
C16|
V: Vocal
D16|
w: b
V: Ins
D16|
V: Vocal
E16|
w: c
V: Ins
E16|
V: Vocal
F16|
w: d
V: Ins
F16|
V: Vocal
CDEF GABc defg abc'd'|
V: Ins
CDEF GABc defg abc'd'|
V: Vocal
CDEF GABc defg abc'd'|
V: Ins
CDEF GABc defg abc'd'|
`;
    const musicLines = (abc: string, voice: string) =>
      abc.split(/\r?\n/).filter((line, i, lines) => {
        if (!/\|/.test(line) || /^[wW]:/.test(line) || /^%/.test(line)) return false;
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j] === `V: ${voice}`) return true;
          if (/^V:/.test(lines[j])) return false;
        }
        return false;
      });
    const barsOn = (line: string) => (line.match(/\|/g) || []).length;
    const once = editor.editScore(score, { op: 'reflow' });
    expect(once.error).toBeFalsy();
    const vocal = musicLines(once.abc, 'Vocal');
    expect(vocal.some((line) => /C16\|D16\|E16\|F16\|/.test(line.replace(/\s+/g, '')))).toBe(true);
    const dense = vocal.filter((line) => /c'\s*d'/.test(line));
    expect(dense).toHaveLength(2);
    expect(dense.every((line) => barsOn(line) === 1)).toBe(true);
  });

  it('reflow keeps four bars on a line unless a bar already fills it', () => {
    const bar = 'CDEF GABc|';
    const score = `X:1
T:
M:4/4
L:1/8
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
${Array.from({ length: 8 }, () => `V: Vocal\n${bar}\nV: Ins\n${bar}`).join('\n')}
`;
    const musicLines = (abc: string, voice: string) =>
      abc.split(/\r?\n/).filter((line, i, lines) => {
        if (!/\|/.test(line) || /^[wW]:/.test(line) || /^%/.test(line)) return false;
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j] === `V: ${voice}`) return true;
          if (/^V:/.test(lines[j])) return false;
        }
        return false;
      });
    const once = editor.editScore(score, { op: 'reflow' });
    expect(once.error).toBeFalsy();
    const vocal = musicLines(once.abc, 'Vocal');
    expect(vocal).toHaveLength(2);
    expect(vocal.every((line) => (line.match(/\|/g) || []).length === 4)).toBe(true);
  });

  function vocalLines(abc: string) {
    return abc.split(/\r?\n/).filter((line, i, lines) => {
      if (!/\|/.test(line) || /^[wW]:/.test(line) || /^%/.test(line)) return false;
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j] === 'V: Vocal') return true;
        if (/^V:/.test(lines[j])) return false;
      }
      return false;
    });
  }

  function pairedScore(bar: string, count: number, unit: string) {
    return `X:1
T:
M:4/4
L:${unit}
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
${Array.from({ length: count }, () => `V: Vocal\n${bar}\nV: Ins\n${bar}`).join('\n')}
`;
  }

  it('reflow keeps at least the minimum bars when a bar is dense', () => {
    const once = editor.editScore(pairedScore("CDEF GABc defg abc'd'|", 4, '1/16'), {
      op: 'reflow', minBars: 2, maxBars: 4,
    });
    expect(once.error).toBeFalsy();
    const vocal = vocalLines(once.abc);
    expect(vocal).toHaveLength(2);
    expect(vocal.every((line) => (line.match(/\|/g) || []).length === 2)).toBe(true);
  });

  it('reflow uses the maximum on every full line when minimum and maximum match', () => {
    const once = editor.editScore(pairedScore("CDEF GABc defg abc'd'|", 6, '1/16'), {
      op: 'reflow', minBars: 4, maxBars: 4,
    });
    expect(once.error).toBeFalsy();
    const vocal = vocalLines(once.abc);
    expect(vocal.map((line) => (line.match(/\|/g) || []).length)).toEqual([4, 2]);
  });

  it('reflow packs ordinary bars up to a higher maximum', () => {
    const once = editor.editScore(pairedScore('CDEF GABc|', 8, '1/8'), {
      op: 'reflow', minBars: 1, maxBars: 6,
    });
    expect(once.error).toBeFalsy();
    const vocal = vocalLines(once.abc);
    expect(vocal.map((line) => (line.match(/\|/g) || []).length)).toEqual([6, 2]);
  });

  it('reflow uses the bar fields even when the toolbar click does not blur them', async () => {
    const globals = globalThis as { abc2svg?: unknown };
    const previous = globals.abc2svg;
    globals.abc2svg = { Abc() {}, jianpu: {}, diag: {} };
    const score = pairedScore("CDEF GABc defg abc'd'|", 8, '1/16');
    try {
      const pending = editor.open?.(score, null, { strings: jianpuStrings.zh as unknown as Record<string, string> });
      await Promise.resolve();
      const min = document.querySelector(".yue-jp-editor input[data-bars='min']") as HTMLInputElement | null;
      const max = document.querySelector(".yue-jp-editor input[data-bars='max']") as HTMLInputElement | null;
      expect(min && max).toBeTruthy();
      min!.value = '4';
      max!.value = '5';
      min!.focus();
      (document.querySelector(".yue-jp-editor [data-act='reflow']") as HTMLButtonElement).click();
      const abc = (editor as { currentAbc?: () => string }).currentAbc?.() || '';
      const vocal = vocalLines(abc);
      expect(vocal.map((line) => (line.match(/\|/g) || []).length)).toEqual([4, 4]);
      min!.value = '1';
      max!.value = '4';
      min!.dispatchEvent(new Event('change'));
      (document.querySelector('.yue-jp-editor [data-act="cancel"]') as HTMLButtonElement | null)?.click();
      await pending;
    } finally {
      document.querySelector('.yue-jp-editor')?.remove();
      globals.abc2svg = previous;
    }
  });

  it('joins this bar with the next on the same line', () => {
    const score = `X:1
T:
M:4/4
L:1/4
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C D E F|G A B c|d e f g|
w: do re mi fa so la ti do re mi fa so
V: Ins
C D E F|G A B c|d e f g|
`;
    const joined = editor.editScore(score, { op: 'join', index: 1, voice: 'Vocal', minBars: 1, maxBars: 4 });
    expect(joined.error).toBeFalsy();
    const body = joined.abc.replace(/\s+/g, '');
    expect(body).toContain('V:VocalCDEFGABc|defg|');
    expect(body).toContain('V:InsCDEFGABc|defg|');
    expect(body).toContain('w:doremifasolatidoremifaso');
    expect(joined.beats).toBe(8);
  });

  it('joins the last bar of a line with the first bar of the next', () => {
    const score = `X:1
T:
M:4/4
L:1/4
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C D E F|
w: do re mi fa
V: Ins
C D E F|
V: Vocal
G A B c|d e f g|
w: so la ti do re mi fa so
V: Ins
G A B c|d e f g|
`;
    const joined = editor.editScore(score, { op: 'join', index: 0, voice: 'Vocal', minBars: 1, maxBars: 4 });
    expect(joined.error).toBeFalsy();
    const body = joined.abc.replace(/\s+/g, '');
    expect(body).toContain('CDEFGABc|defg|');
    expect(body).toContain('w:doremifasolatidoremifaso');
    expect(joined.beats).toBe(8);
  });

  it('joins two short bars and leaves the following bar short', () => {
    const score = `X:1
T:
M:4/4
L:1/4
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C D|E F|G|
w: do re mi fa so
V: Ins
C D|E F|G|
`;
    const joined = editor.editScore(score, { op: 'join', index: 0, voice: 'Vocal', minBars: 1, maxBars: 4 });
    expect(joined.error).toBeFalsy();
    const body = joined.abc.replace(/\s+/g, '');
    expect(body).toContain('V:VocalCDEF|G|');
    expect(body).toContain('V:InsCDEF|G|');
    expect(body).toContain('w:doremifaso');
    expect(joined.beats).toBeNull();
  });

  it('refuses to join the last bar of a section', () => {
    const score = `X:1
T:
M:4/4
L:1/4
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C D|E F|G|
V: Ins
C D|E F|G|
`;
    const stayed = editor.editScore(score, { op: 'join', index: 4, voice: 'Vocal' });
    expect(stayed.error).toBeTruthy();
    expect(stayed.abc).toBe(score);
  });
});
