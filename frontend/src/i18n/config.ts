import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  applyDocumentLanguage,
  defaultLocale,
  fallbackLocale,
  parseLocale,
  readStoredLocale,
} from "@/i18n/locale";
import bosnianCommon from "@/i18n/locales/bs/common.json";
import englishCommon from "@/i18n/locales/en/common.json";

let initialization: Promise<typeof i18n> | undefined;

const warnAboutMissingTranslation = (
  languages: readonly string[],
  namespace: string,
  key: string,
): void => {
  console.warn(
    `[i18n] Missing translation: ${namespace}:${key} (${languages.join(", ")})`,
  );
};

i18n.on("languageChanged", (language: string) => {
  applyDocumentLanguage(parseLocale(language));
});

export const initializeI18n = (): Promise<typeof i18n> => {
  if (initialization) {
    return initialization;
  }
  initialization = i18n
    .use(initReactI18next)
    .init({
      lng: readStoredLocale(),
      fallbackLng: fallbackLocale,
      ns: ["common"],
      defaultNS: "common",
      resources: {
        [defaultLocale]: { common: bosnianCommon },
        [fallbackLocale]: { common: englishCommon },
      },
      interpolation: {
        escapeValue: false,
      },
      returnNull: false,
      returnEmptyString: false,
      saveMissing: false,
      ...(import.meta.env.DEV
        ? { missingKeyHandler: warnAboutMissingTranslation }
        : {}),
      react: {
        useSuspense: false,
      },
    })
    .then(async () => {
      const locale = parseLocale(i18n.language);
      if (i18n.language !== locale) {
        await i18n.changeLanguage(locale);
      } else {
        applyDocumentLanguage(locale);
      }
      return i18n;
    });
  return initialization;
};

export { i18n };
