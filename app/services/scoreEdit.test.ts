import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(path.join(here, '../public/score/score_edit.js'));

const editor = (globalThis as { yueScoreEditor?: {
  editScore: (abc: string, command: Record<string, unknown>) => { abc: string; error?: string | null };
  compareJianpuNotes: (text: string, svg: string, beat: number, lDen: number, perBar: number) => { ok: boolean; message: string };
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
  it('changes the first vocal degree', () => {
    const edited = editor.editScore(ABC, { voice: 'Vocal', op: 'degree', index: 0, degree: 5 });
    expect(edited.error).toBeFalsy();
    expect(edited.abc).toContain('"C"G4D4E4F4|');
  });

  it('accepts a rest run that mixes one 0 per bar with a sliced whole rest', () => {
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
});
