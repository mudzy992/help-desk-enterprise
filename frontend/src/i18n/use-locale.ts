import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  parseLocale,
  persistLocale,
  type Locale,
} from "@/i18n/locale";
import { readStoredSession } from "@/services/session-store";
import { updateUserPreferences } from "@/services/user-preferences-api";

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
      // Paket 1.5: e-mails follow the UI language. Best effort — the switch
      // itself must never fail because the preference could not be saved.
      if (readStoredSession() !== null) {
        void updateUserPreferences({ preferredLocale: resolvedLocale }).catch(() => undefined);
      }
    },
    [i18n],
  );

  return { locale, changeLocale };
}
