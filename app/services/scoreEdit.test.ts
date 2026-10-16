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
  editScore: (abc: string, command: Record<string, unknown>) => { abc: string; error?: string | null };
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
});
