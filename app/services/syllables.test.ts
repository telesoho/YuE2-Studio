import { describe, expect, it } from 'vitest';
import { syllableChangesOf } from './syllables';

describe('syllables of new words against the old', () => {
  it('names the lines whose counts changed, added or dropped', () => {
    expect(syllableChangesOf([7, 8, 5], [7, 9, 5])).toEqual([{ line: 2, before: 8, after: 9 }]);
    expect(syllableChangesOf([7, 8], [7])).toEqual([{ line: 2, before: 8, after: null }]);
    expect(syllableChangesOf([7], [7, 4])).toEqual([{ line: 2, before: null, after: 4 }]);
    expect(syllableChangesOf([7, 8], [7, 8])).toEqual([]);
  });
});
