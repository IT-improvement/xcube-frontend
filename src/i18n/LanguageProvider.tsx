import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createT, detectLanguage, readSavedLanguage, saveLanguage, setCurrentLanguage, STORAGE_KEY } from './core';
import type { Lang, TFunction } from './types';

type LanguageContextValue = { lang: Lang; setLang: (lang: Lang) => void; t: TFunction };

// Without a provider (isolated component tests) screens render in Korean.
const LanguageContext = createContext<LanguageContextValue>({ lang: 'ko', setLang: () => {}, t: createT('ko') });

/**
 * Holds the screen language. It starts from the saved choice or the browser languages, keeps
 * `<html lang>` in step, and follows a choice made in another tab of this browser.
 */
export function LanguageProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? detectLanguage());
  // Formatting helpers called during this render should already use the new language.
  setCurrentLanguage(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const saved = readSavedLanguage();
      if (saved) setLangState(saved);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setLang = useCallback((next: Lang) => {
    saveLanguage(next);
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: createT(lang) }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** `{ lang, setLang, t }` */
export const useLanguage = () => useContext(LanguageContext);

/** `t('landing.hero.title')`, `t('titles.dataNamed', { name })` */
export const useT = () => useContext(LanguageContext).t;
