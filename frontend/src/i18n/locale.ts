export const supportedLocales = ["bs", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "bs";
export const fallbackLocale: Locale = "en";
export const localeStorageKey = "ephelpdesk.locale";

const localeSet = new Set<string>(supportedLocales);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && localeSet.has(value);
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  try {
    return parseLocale(window.localStorage.getItem(localeStorageKey));
  } catch {
    return defaultLocale;
  }
}

export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(localeStorageKey, locale);
  } catch {
    return;
  }
}

export function applyDocumentLanguage(locale: Locale): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = locale;
}
