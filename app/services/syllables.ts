/** Each sung line with the syllables the score lays it out by, counted by the service as the score does. */
export async function lyricSyllables(lyrics: string): Promise<number[]> {
  const response = await fetch('/v1/lyrics/syllables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lyrics }) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `/v1/lyrics/syllables answered ${response.status}`);
  return (body?.lines ?? []).map((line: { syllables: number }) => line.syllables);
}

export interface SyllableChange {
  /** The sung line, counted from 1. */
  line: number;
  before: number | null;
  after: number | null;
}

/** The sung lines whose counts differ, by their place in the song: a line added or dropped counts too. */
export function syllableChangesOf(before: number[], after: number[]): SyllableChange[] {
  const changes: SyllableChange[] = [];
  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    const was = before[index] ?? null;
    const is = after[index] ?? null;
    if (was !== is) changes.push({ line: index + 1, before: was, after: is });
  }
  return changes;
}
