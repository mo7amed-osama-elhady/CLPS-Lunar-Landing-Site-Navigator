import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  LANG_OPTIONS,
  TRANSLATIONS,
  type LangCode,
  type TranslationBundle,
} from '../i18n/translations.ts';

const STORAGE_KEY = 'clps_navigator_lang';

interface LanguageContextValue {
  lang: LangCode;
  setLang: (next: LangCode) => void;
  dir: 'ltr' | 'rtl';
  t: TranslationBundle;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readInitialLanguage(): LangCode {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && LANG_OPTIONS.some((opt) => opt.code === saved)) {
      return saved as LangCode;
    }
  } catch {
    // Ignore storage access errors
  }
  // Default strictly to English on first visit (never auto-detect browser language)
  return 'en';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => readInitialLanguage());

  const dir = LANG_OPTIONS.find((o) => o.code === lang)?.dir ?? 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage access errors
    }
  }, [lang, dir]);

  const setLang = (next: LangCode) => {
    setLangState(next);
  };

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang,
        dir,
        t: TRANSLATIONS[lang],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
