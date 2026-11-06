/**
 * What a studio suggests while a style is written, with a gloss in the window's
 * language. The suggestions stay in English, the language the model reads its
 * style in; a window in another language shows each one's gloss beside it. The
 * same file in every studio, reading what its own `data` folder holds:
 * - `style_suggestions.txt`: the style phrases, one a line (a studio without it
 *   suggests its genres alone);
 * - `style_suggestions.<language>.txt`: one `phrase<TAB>gloss` a line;
 * - `genres.<language>.txt`: one `genre<TAB>gloss` a line, for the studio's genres.
 * A language without a file shows the English alone.
 */

import type { Language } from '../i18n/translations';

const phraseTexts = import.meta.glob('../data/style_suggestions.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const phraseGlossTexts = import.meta.glob('../data/style_suggestions.*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const genreGlossTexts = import.meta.glob('../data/genres.*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const lines = (text: string) => text.split('\n').map(line => line.replace(/\r$/, '')).filter(line => line.trim().length > 0);

const glossesByLanguage = (texts: Record<string, string>, file: RegExp): Partial<Record<Language, Map<string, string>>> => Object.fromEntries(
  Object.entries(texts).map(([path, text]) => {
    const language = path.match(file)?.[1] ?? path;
    const glosses = new Map(lines(text).map(line => {
      const [english, gloss = ''] = line.split('\t');
      return [english.trim(), gloss.trim()] as [string, string];
    }));
    return [language, glosses];
  }),
);

export const STYLE_SUGGESTIONS: string[] = Object.values(phraseTexts).flatMap(text => lines(text).map(line => line.trim()));

/** Each language's glosses by phrase, from the files beside the list. */
export const STYLE_GLOSSES = glossesByLanguage(phraseGlossTexts, /style_suggestions\.([a-z]+)\.txt$/);

/** Each language's glosses by genre, from the files beside the list. */
export const GENRE_GLOSSES = glossesByLanguage(genreGlossTexts, /genres\.([a-z]+)\.txt$/);

/** A genre's gloss in `language`, when the language has one for it. */
export function genreGloss(genre: string, language: Language): string | undefined {
  return GENRE_GLOSSES[language]?.get(genre) || undefined;
}

export interface StyleSuggestion {
  value: string;
  label?: string;
}

/** The studio's genres, then the style phrases, each with its gloss in `language` where it has one. */
export function styleSuggestions(language: Language, genres: readonly string[]): StyleSuggestion[] {
  const phraseGlosses = STYLE_GLOSSES[language];
  return [
    ...genres.map(value => ({ value, label: genreGloss(value, language) })),
    ...STYLE_SUGGESTIONS.map(value => ({ value, label: phraseGlosses?.get(value) || undefined })),
  ].map(({ value, label }) => (label ? { value, label } : { value }));
}
