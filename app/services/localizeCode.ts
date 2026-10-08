import type { TranslationKey } from '../i18n/translations';

/** Translate a stable server code (`{"code":…}`) or pass legacy text through. */
export function localizeCode(
  raw: string,
  t: (key: TranslationKey) => string,
): string {
  const text = String(raw || '').trim();
  if (!text) return text;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed.code === 'string') {
      let out = t(parsed.code as TranslationKey);
      for (const [key, value] of Object.entries(parsed)) {
        if (key === 'code') continue;
        out = out.split(`{${key}}`).join(String(value));
      }
      return out;
    }
  } catch {
    /* plain text */
  }
  const keyed = t(text as TranslationKey);
  return keyed === text ? text : keyed;
}
