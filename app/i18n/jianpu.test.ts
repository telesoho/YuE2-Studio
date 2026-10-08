import { describe, expect, it } from 'vitest';
import { jianpuStrings } from './jianpu';

describe('jianpu strings', () => {
  it('every language carries every key, none empty', () => {
    const keys = Object.keys(jianpuStrings.en).sort();
    for (const [language, strings] of Object.entries(jianpuStrings)) {
      expect(Object.keys(strings).sort(), language).toEqual(keys);
      for (const key of keys) {
        expect((strings as Record<string, string>)[key]?.trim().length, `${language}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
