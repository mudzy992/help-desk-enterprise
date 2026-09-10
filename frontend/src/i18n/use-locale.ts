import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  parseLocale,
  persistLocale,
  type Locale,
} from "@/i18n/locale";

interface UseLocaleResult {
  readonly locale: Locale;
  readonly changeLocale: (nextLocale: string) => Promise<void>;
}

export function useLocale(): UseLocaleResult {
  const { i18n } = useTranslation();
  const locale = parseLocale(i18n.resolvedLanguage ?? i18n.language);

  const changeLocale = useCallback(
    async (nextLocale: string): Promise<void> => {
      const resolvedLocale = parseLocale(nextLocale);
      persistLocale(resolvedLocale);
      if (parseLocale(i18n.language) !== resolvedLocale) {
        await i18n.changeLanguage(resolvedLocale);
      }
    },
    [i18n],
  );

  return { locale, changeLocale };
}
