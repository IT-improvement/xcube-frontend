import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createT, detectLanguage, readSavedLanguage, saveLanguage, setCurrentLanguage, STORAGE_KEY } from './core';
import type { Lang, TFunction } from './types';

type LanguageContextValue = {
  lang: Lang;
  /** The user's choice (any switcher): saved in this browser and announced to `onChoose` listeners. */
  setLang: (lang: Lang) => void;
  /** Shows a language without saving it as this browser's choice (the account's language after sign-in). */
  applyLang: (lang: Lang) => void;
  /** Calls `listener` after each user choice; returns the unsubscribe. The auth provider saves it to the account. */
  onChoose: (listener: (lang: Lang) => void) => () => void;
  t: TFunction;
};

// Without a provider (isolated component tests) screens render in Korean.
const LanguageContext = createContext<LanguageContextValue>({ lang: 'ko', setLang: () => {}, applyLang: () => {}, onChoose: () => () => {}, t: createT('ko') });

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

  const listeners = useRef(new Set<(lang: Lang) => void>());
  const setLang = useCallback((next: Lang) => {
    saveLanguage(next);
    setLangState(next);
    listeners.current.forEach((listener) => listener(next));
  }, []);
  const applyLang = useCallback((next: Lang) => setLangState(next), []);
  const onChoose = useCallback((listener: (lang: Lang) => void) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);

  const value = useMemo(() => ({ lang, setLang, applyLang, onChoose, t: createT(lang) }), [lang, setLang, applyLang, onChoose]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** `{ lang, setLang, applyLang, onChoose, t }` */
export const useLanguage = () => useContext(LanguageContext);

/** `t('landing.hero.title')`, `t('titles.dataNamed', { name })` */
export const useT = () => useContext(LanguageContext).t;
