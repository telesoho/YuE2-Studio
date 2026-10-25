import { describe, expect, it } from 'vitest';
import { languageFromTags } from './I18nContext';

describe('languageFromTags', () => {
  it('maps a system locale to a supported interface language', () => {
    expect(languageFromTags(['zh-CN'])).toBe('zh');
    expect(languageFromTags(['ja-JP'])).toBe('ja');
    expect(languageFromTags(['ko'])).toBe('ko');
    expect(languageFromTags(['ru-RU'])).toBe('ru');
    expect(languageFromTags(['en-US'])).toBe('en');
    expect(languageFromTags(['de-DE'])).toBe('en');
    expect(languageFromTags(['de', 'zh-TW'])).toBe('zh');
  });
});
