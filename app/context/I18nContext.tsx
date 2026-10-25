import React, { createContext, useContext, useState, ReactNode } from 'react';
import { translations, Language, TranslationKey } from '../i18n/translations';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  /** "1 song", "3 песни", "61 песня": the form each language asks for. */
  songCount: (count: number) => string;
}

// One context object for the life of the page: when a strings file changes in
// development, this module is evaluated again, and a second context would leave
// every consumer outside the provider that is already mounted.
const I18nContext: React.Context<I18nContextType | undefined> =
  import.meta.hot?.data?.i18nContext ?? createContext<I18nContextType | undefined>(undefined);
if (import.meta.hot?.data) import.meta.hot.data.i18nContext = I18nContext;

const SUPPORTED = new Set(['zh', 'en', 'ja', 'ko', 'ru']);

/** First supported primary subtag (zh-CN, ja-JP, …). English when none match. */
export function languageFromTags(tags: readonly string[]): Language {
  for (const tag of tags) {
    const code = tag?.toLowerCase().split('-')[0];
    if (code && SUPPORTED.has(code)) return code as Language;
  }
  return 'en';
}

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem('language');
    if (stored && SUPPORTED.has(stored)) return stored as Language;
    const tags = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
    return languageFromTags(tags);
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || key;
  };

  const songCount = (count: number): string =>
    t(`songCount_${new Intl.PluralRules(language).select(count)}` as TranslationKey).replace('{count}', String(count));

  return (
    <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t, songCount }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};
