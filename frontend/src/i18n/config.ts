import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  applyDocumentLanguage,
  defaultLocale,
  fallbackLocale,
  parseLocale,
  readStoredLocale,
  type Locale,
} from "@/i18n/locale";
import { reportClientWarning } from "@/lib/app/client-logger";

let initialization: Promise<typeof i18n> | undefined;
const resourceLoads = new Map<Locale, Promise<object>>();
const resourceRegistrations = new Map<Locale, Promise<void>>();

const localeResources = {
  bs: () => import("@/i18n/locales/bs/common.json").then((module) => module.default),
  en: () => import("@/i18n/locales/en/common.json").then((module) => module.default),
} satisfies Record<Locale, () => Promise<object>>;

export function loadLocaleResources(locale: Locale): Promise<object> {
  const current = resourceLoads.get(locale);
  if (current) return current;
  const load = localeResources[locale]();
  resourceLoads.set(locale, load);
  return load;
}

export function ensureLocaleResources(locale: Locale): Promise<void> {
  if (i18n.isInitialized && i18n.hasResourceBundle(locale, "common")) return Promise.resolve();
  const current = resourceRegistrations.get(locale);
  if (current) return current;
  const registration = loadLocaleResources(locale).then((common) => {
    if (i18n.isInitialized && !i18n.hasResourceBundle(locale, "common"))
      i18n.addResourceBundle(locale, "common", common, true, true);
  });
  resourceRegistrations.set(locale, registration);
  return registration;
}

const warnAboutMissingTranslation = (
  languages: readonly string[],
  namespace: string,
  key: string,
): void => {
  reportClientWarning("i18n_missing_translation", `${namespace}:${key} (${languages.join(", ")})`);
};

i18n.on("languageChanged", (language: string) => {
  applyDocumentLanguage(parseLocale(language));
});

export const initializeI18n = (): Promise<typeof i18n> => {
  if (initialization) return initialization;
  const locale = readStoredLocale();
  initialization = loadLocaleResources(locale).then((common) =>
    i18n
      .use(initReactI18next)
      .init({
        lng: locale,
        fallbackLng: fallbackLocale,
        ns: ["common"],
        defaultNS: "common",
        resources: { [locale]: { common } },
        interpolation: { escapeValue: false },
        returnNull: false,
        returnEmptyString: false,
        saveMissing: false,
        ...(import.meta.env.DEV ? { missingKeyHandler: warnAboutMissingTranslation } : {}),
        react: { useSuspense: false },
      })
      .then(async () => {
        const resolvedLocale = parseLocale(i18n.language);
        if (i18n.language !== resolvedLocale) await i18n.changeLanguage(resolvedLocale);
        else applyDocumentLanguage(resolvedLocale);
        return i18n;
      }),
  );
  return initialization;
};

export { i18n };
export { defaultLocale };
