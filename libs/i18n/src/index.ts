import enUS from './messages/en-US.json';
import frFR from './messages/fr-FR.json';
import deDE from './messages/de-DE.json';
import esES from './messages/es-ES.json';
import ptBR from './messages/pt-BR.json';

export type SupportedLocale = 'en-US' | 'fr-FR' | 'de-DE' | 'es-ES' | 'pt-BR';

export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

export const SUPPORTED_LOCALES: { code: SupportedLocale; name: string; nativeName: string }[] = [
  { code: 'en-US', name: 'English (US)', nativeName: 'English' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
];

export const MESSAGES: Record<SupportedLocale, Record<string, string>> = {
  'en-US': enUS,
  'fr-FR': frFR,
  'de-DE': deDE,
  'es-ES': esES,
  'pt-BR': ptBR,
};

/**
 * Retrieves the compiled messages dictionary for a given locale.
 * Falls back to en-US if an unsupported locale is requested.
 */
export function getMessages(locale?: string): Record<string, string> {
  if (locale && locale in MESSAGES) {
    return MESSAGES[locale as SupportedLocale];
  }
  return MESSAGES[DEFAULT_LOCALE];
}

/**
 * Resolves a client's Accept-Language header to the closest supported locale.
 */
export function resolveLocale(acceptLanguageHeader?: string): SupportedLocale {
  if (!acceptLanguageHeader) return DEFAULT_LOCALE;

  const languages = acceptLanguageHeader
    .split(',')
    .map((item) => item.split(';')[0].trim().toLowerCase());

  for (const lang of languages) {
    if (lang.startsWith('fr')) return 'fr-FR';
    if (lang.startsWith('de')) return 'de-DE';
    if (lang.startsWith('es')) return 'es-ES';
    if (lang.startsWith('pt')) return 'pt-BR';
    if (lang.startsWith('en')) return 'en-US';
  }

  return DEFAULT_LOCALE;
}

/**
 * Interpolates variables in format {variableName} with given data.
 */
export function formatMessage(
  template: string,
  variables: Record<string, string | number | undefined> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{${key}}`;
  });
}
