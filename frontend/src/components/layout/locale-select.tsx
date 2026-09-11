import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/use-locale";
import { supportedLocales } from "@/i18n/locale";

const localeLabelKeys = {
  bs: "locale.bosnian",
  en: "locale.english",
} as const;

export function LocaleSelect() {
  const { t } = useTranslation();
  const { locale, changeLocale } = useLocale();

  return (
    <label className="flex shrink-0 items-center">
      <span className="sr-only">{t("locale.label")}</span>
      <select
        className="h-8 max-w-[9.5rem] rounded-md border border-border bg-surface px-2 text-metadata text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={locale}
        onChange={(event) => {
          void changeLocale(event.target.value);
        }}
      >
        {supportedLocales.map((supportedLocale) => (
          <option key={supportedLocale} value={supportedLocale}>
            {t(localeLabelKeys[supportedLocale])}
          </option>
        ))}
      </select>
    </label>
  );
}
