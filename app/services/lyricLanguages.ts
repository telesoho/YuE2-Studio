/**
 * Whisper / faster-whisper language codes (openai/whisper tokenizer.LANGUAGES).
 * Score reading passes a selected code as --language; "auto" is handled in the UI.
 */

export interface LyricLanguage {
  code: string;
  name: string;
}

/** OpenAI Whisper LANGUAGES: code → lowercase English name. */
const WHISPER: Record<string, string> = {
  en: 'english',
  zh: 'chinese',
  de: 'german',
  es: 'spanish',
  ru: 'russian',
  ko: 'korean',
  fr: 'french',
  ja: 'japanese',
  pt: 'portuguese',
  tr: 'turkish',
  pl: 'polish',
  ca: 'catalan',
  nl: 'dutch',
  ar: 'arabic',
  sv: 'swedish',
  it: 'italian',
  id: 'indonesian',
  hi: 'hindi',
  fi: 'finnish',
  vi: 'vietnamese',
  he: 'hebrew',
  uk: 'ukrainian',
  el: 'greek',
  ms: 'malay',
  cs: 'czech',
  ro: 'romanian',
  da: 'danish',
  hu: 'hungarian',
  ta: 'tamil',
  no: 'norwegian',
  th: 'thai',
  ur: 'urdu',
  hr: 'croatian',
  bg: 'bulgarian',
  lt: 'lithuanian',
  la: 'latin',
  mi: 'maori',
  ml: 'malayalam',
  cy: 'welsh',
  sk: 'slovak',
  te: 'telugu',
  fa: 'persian',
  lv: 'latvian',
  bn: 'bengali',
  sr: 'serbian',
  az: 'azerbaijani',
  sl: 'slovenian',
  kn: 'kannada',
  et: 'estonian',
  mk: 'macedonian',
  br: 'breton',
  eu: 'basque',
  is: 'icelandic',
  hy: 'armenian',
  ne: 'nepali',
  mn: 'mongolian',
  bs: 'bosnian',
  kk: 'kazakh',
  sq: 'albanian',
  sw: 'swahili',
  gl: 'galician',
  mr: 'marathi',
  pa: 'punjabi',
  si: 'sinhala',
  km: 'khmer',
  sn: 'shona',
  yo: 'yoruba',
  so: 'somali',
  af: 'afrikaans',
  oc: 'occitan',
  ka: 'georgian',
  be: 'belarusian',
  tg: 'tajik',
  sd: 'sindhi',
  gu: 'gujarati',
  am: 'amharic',
  yi: 'yiddish',
  lo: 'lao',
  uz: 'uzbek',
  fo: 'faroese',
  ht: 'haitian creole',
  ps: 'pashto',
  tk: 'turkmen',
  nn: 'nynorsk',
  mt: 'maltese',
  sa: 'sanskrit',
  lb: 'luxembourgish',
  my: 'myanmar',
  bo: 'tibetan',
  tl: 'tagalog',
  mg: 'malagasy',
  as: 'assamese',
  tt: 'tatar',
  haw: 'hawaiian',
  ln: 'lingala',
  ha: 'hausa',
  ba: 'bashkir',
  jw: 'javanese',
  su: 'sundanese',
  yue: 'cantonese',
};

const PINNED = ['zh', 'en', 'ja', 'ko', 'ru'] as const;

function titleCase(name: string): string {
  return name.replace(/\b\w/g, ch => ch.toUpperCase());
}

function entry(code: string): LyricLanguage {
  return { code, name: titleCase(WHISPER[code]) };
}

const rest = Object.keys(WHISPER)
  .filter(code => !(PINNED as readonly string[]).includes(code))
  .sort((a, b) => WHISPER[a].localeCompare(WHISPER[b]))
  .map(entry);

/** Whisper tokenizer.LANGUAGES (100 codes): studio languages first, then A–Z by English name. */
export const LYRIC_LANGUAGES: LyricLanguage[] = [...PINNED.map(entry), ...rest];

/** Whisper code → BCP 47 when they differ. */
const BCP47: Record<string, string> = { jw: 'jv', tl: 'fil' };

/** ICU has no self-locale; avoid falling back to the OS language. */
const NATIVE: Record<string, string> = {
  la: 'Latina',
  ht: 'Kreyòl ayisyen',
  ba: 'башҡорт теле',
};

function nativeName(code: string, english: string): string {
  if (NATIVE[code]) return NATIVE[code];
  const locale = BCP47[code] ?? code;
  try {
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    const resolved = names.resolvedOptions().locale.toLowerCase();
    const tag = locale.toLowerCase();
    if (!resolved.startsWith(tag.slice(0, 2)) && resolved !== tag) return english;
    return names.of(locale) || english;
  } catch {
    return english;
  }
}

export function lyricLanguageLabel(lang: LyricLanguage): string {
  return `${nativeName(lang.code, lang.name)} (${lang.code})`;
}
