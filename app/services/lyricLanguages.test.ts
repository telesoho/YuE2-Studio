import { describe, expect, it } from 'vitest';
import { LYRIC_LANGUAGES, lyricLanguageLabel } from './lyricLanguages';

describe('lyricLanguages', () => {
  it('lists Whisper tokenizer.LANGUAGES once, with ja and yue', () => {
    // openai/whisper tokenizer.LANGUAGES (incl. yue) is 100 codes.
    expect(LYRIC_LANGUAGES).toHaveLength(100);
    const codes = LYRIC_LANGUAGES.map(lang => lang.code);
    expect(new Set(codes).size).toBe(100);
    expect(codes).toContain('ja');
    expect(codes).toContain('yue');
    expect(codes.slice(0, 5)).toEqual(['zh', 'en', 'ja', 'ko', 'ru']);
    expect(lyricLanguageLabel(LYRIC_LANGUAGES.find(lang => lang.code === 'ja')!)).toBe('Japanese (ja)');
  });
});
