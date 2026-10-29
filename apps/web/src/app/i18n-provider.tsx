'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { IntlProvider } from 'react-intl';
import { getMessages, DEFAULT_LOCALE, SupportedLocale, SUPPORTED_LOCALES } from '@pactintel/i18n';

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  availableLocales: typeof SUPPORTED_LOCALES;
}

const I18nContext = createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  availableLocales: SUPPORTED_LOCALES,
});

export const useAppI18n = () => useContext(I18nContext);

export function AppIntlProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    // Detect stored preference or browser language
    const stored = localStorage.getItem('pactintel_locale') as SupportedLocale | null;
    if (stored && SUPPORTED_LOCALES.some((l: { code: string }) => l.code === stored)) {
      setLocaleState(stored);
    } else {
      const browserLang = navigator.language;
      const matched = SUPPORTED_LOCALES.find((l: { code: string }) =>
        l.code.startsWith(browserLang.slice(0, 2)),
      );
      if (matched) {
        setLocaleState(matched.code);
      }
    }
  }, []);

  const setLocale = (newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    localStorage.setItem('pactintel_locale', newLocale);
  };

  const messages = getMessages(locale);

  return (
    <I18nContext.Provider value={{ locale, setLocale, availableLocales: SUPPORTED_LOCALES }}>
      <IntlProvider messages={messages} locale={locale} defaultLocale={DEFAULT_LOCALE}>
        {children}
      </IntlProvider>
    </I18nContext.Provider>
  );
}
