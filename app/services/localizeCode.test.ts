import { describe, expect, it } from 'vitest';
import { localizeCode } from './localizeCode';
import { jianpuStrings } from '../i18n/jianpu';
import type { TranslationKey } from '../i18n/translations';

describe('localizeCode', () => {
  const t = (key: TranslationKey) => (jianpuStrings.en as Record<string, string>)[key] || key;

  it('fills fields from a code payload', () => {
    expect(localizeCode(JSON.stringify({ code: 'scoreWarnUnassigned', count: 3 }), t)).toBe(
      '3 syllables could not be matched to melody notes',
    );
  });

  it('passes legacy Chinese through', () => {
    expect(localizeCode('人声分离未就绪，改用原混音', t)).toBe('人声分离未就绪，改用原混音');
  });
});
