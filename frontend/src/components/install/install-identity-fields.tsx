import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  controlClassName,
  hintClassName,
  labelClassName,
  selectClassName,
} from "@/components/ui/control";
import {
  installIdentityLimits,
  type InstallIdentityFormValues,
} from "@/lib/install/install-identity-form";
import { listInstallTimeZones } from "@/lib/install/install-time-zones";
import { readLogoFile } from "@/lib/branding/read-logo-file";
import type { LogoReadError } from "@/lib/branding/read-logo-file";

/**
 * F2: the identity fields. Everything except the organisation name may be left
 * empty ("Podesi kasnije") — an empty field is simply not posted, so an existing
 * value is never overwritten by an untouched one.
 */
export function InstallIdentityFields({
  values,
  logoError,
  onChange,
  onLogoChange,
  onLogoError,
}: {
  readonly values: InstallIdentityFormValues;
  readonly logoError: LogoReadError | null;
  readonly onChange: (partial: Partial<InstallIdentityFormValues>) => void;
  readonly onLogoChange: (dataUrl: string) => void;
  readonly onLogoError: (error: LogoReadError | null) => void;
}) {
  const { t } = useTranslation();
  const timeZones = listInstallTimeZones();
  // IN11: the format hint and the logo requirement are part of the field, not
  // loose paragraphs next to it.
  const timeZoneHintId = useId();
  const logoHintId = useId();

  const pickLogo = async (file: File | undefined) => {
    if (file === undefined) return;
    const result = await readLogoFile(file);
    if (result.ok) {
      onLogoError(null);
      onLogoChange(result.dataUrl);
      return;
    }
    onLogoError(result.error);
  };

  return (
    <>
      <label className={labelClassName}>
        {t("install.identity.organizationName")}
        <input
          className={controlClassName}
          value={values.organizationName}
          maxLength={installIdentityLimits.organizationName}
          onChange={(event) => onChange({ organizationName: event.target.value })}
          autoComplete="organization"
          required
        />
      </label>
      <label className={labelClassName}>
        {t("install.identity.appName")}
        <input
          className={controlClassName}
          value={values.appName}
          maxLength={installIdentityLimits.appName}
          onChange={(event) => onChange({ appName: event.target.value })}
          autoComplete="off"
        />
      </label>
      <label className={labelClassName}>
        {t("install.identity.locale")}
        <select
          className={selectClassName}
          value={values.locale}
          onChange={(event) => onChange({ locale: event.target.value === "en" ? "en" : "bs" })}
        >
          <option value="bs">{t("install.identity.localeBs")}</option>
          <option value="en">{t("install.identity.localeEn")}</option>
        </select>
      </label>
      <label className={labelClassName}>
        {t("install.identity.timeZone")}
        <input
          className={controlClassName}
          value={values.timeZone}
          list="install-identity-time-zones"
          aria-describedby={timeZoneHintId}
          onChange={(event) => onChange({ timeZone: event.target.value })}
          autoComplete="off"
          required
        />
        <datalist id="install-identity-time-zones">
          {timeZones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <span id={timeZoneHintId} className={hintClassName}>
          {t("install.identity.timeZoneHint")}
        </span>
      </label>
      <label className={labelClassName}>
        {t("install.identity.logo")}
        <input
          className={controlClassName}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-describedby={logoHintId}
          onChange={(event) => void pickLogo(event.target.files?.[0])}
        />
        <span id={logoHintId} className={hintClassName}>
          {values.logoDataUrl.length > 0 || values.logoConfigured
            ? t("install.identity.logoConfigured")
            : t("install.identity.logoHint")}
        </span>
      </label>
      {logoError !== null ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {t(`settings.branding.${logoError}`)}
        </p>
      ) : null}
      <label className={labelClassName}>
        {t("install.identity.supportEmail")}
        <input
          className={controlClassName}
          type="email"
          maxLength={installIdentityLimits.supportEmail}
          value={values.supportEmail}
          onChange={(event) => onChange({ supportEmail: event.target.value })}
          autoComplete="off"
        />
      </label>
      <label className={labelClassName}>
        {t("install.identity.supportUrl")}
        <input
          className={controlClassName}
          type="url"
          maxLength={installIdentityLimits.supportUrl}
          value={values.supportUrl}
          onChange={(event) => onChange({ supportUrl: event.target.value })}
          autoComplete="off"
        />
      </label>
      <p className={hintClassName}>{t("install.identity.later")}</p>
    </>
  );
}
