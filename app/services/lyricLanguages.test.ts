import { describe, expect, it } from 'vitest';
import { LYRIC_LANGUAGES, lyricLanguageLabel } from './lyricLanguages';

function label(code: string): string {
  return lyricLanguageLabel(LYRIC_LANGUAGES.find(lang => lang.code === code)!);
}

describe('lyricLanguages', () => {
  it('lists Whisper tokenizer.LANGUAGES once, with ja and yue', () => {
    // openai/whisper tokenizer.LANGUAGES (incl. yue) is 100 codes.
    expect(LYRIC_LANGUAGES).toHaveLength(100);
    const codes = LYRIC_LANGUAGES.map(lang => lang.code);
    expect(new Set(codes).size).toBe(100);
    expect(codes).toContain('ja');
    expect(codes).toContain('yue');
    expect(codes.slice(0, 5)).toEqual(['zh', 'en', 'ja', 'ko', 'ru']);
  });

  it('labels each language in its own name', () => {
    expect(label('ja')).toBe('日本語 (ja)');
    expect(label('zh')).toBe('中文 (zh)');
    expect(label('la')).toBe('Latina (la)');
  });
});
