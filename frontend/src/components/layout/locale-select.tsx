import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/use-locale";
import { supportedLocales } from "@/i18n/locale";
import { selectCompactClassName } from "@/components/ui/control";

const localeLabelKeys = {
  bs: "locale.bosnian",
  en: "locale.english",
} as const;

export function LocaleSelect() {
  const { t } = useTranslation();
  const { locale, changeLocale } = useLocale();

  return (
    <label className="flex w-full shrink-0 items-center">
      <span className="sr-only">{t("locale.label")}</span>
      <select
        className={selectCompactClassName}
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
