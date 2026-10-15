import {
  defaultInstallTimeZone,
  isInstallTimeZoneSupported,
} from "@/lib/install/install-time-zones";
import type {
  InstallIdentityLocale,
  InstallIdentityRecord,
  SaveInstallIdentityInput,
} from "@/services/install-identity-api";

/**
 * Install wizard v2 (F2): the identity step's form values. The server validates
 * the same things and the settings registry checks them once more; this module
 * only keeps an obviously incomplete form from being posted.
 */
export const installIdentityLimits = {
  organizationName: 120,
  appName: 60,
  tagline: 120,
  supportEmail: 254,
  supportUrl: 500,
} as const;

export type InstallIdentityFormValues = {
  readonly organizationName: string;
  readonly appName: string;
  readonly locale: InstallIdentityLocale;
  readonly timeZone: string;
  readonly supportEmail: string;
  readonly supportUrl: string;
  /** The logo the operator picked in this session; empty means "configure later". */
  readonly logoDataUrl: string;
  /** True when a logo is already stored (it is never read back as a data URL). */
  readonly logoConfigured: boolean;
};

export function toInstallIdentityFormValues(
  record: InstallIdentityRecord,
): InstallIdentityFormValues {
  return {
    organizationName: record.organizationName,
    appName: record.appName,
    locale: record.locale,
    timeZone: record.timeZone || defaultInstallTimeZone,
    supportEmail: record.supportEmail,
    supportUrl: record.supportUrl,
    logoDataUrl: "",
    logoConfigured: record.logoConfigured,
  };
}

/** The organisation name is the only field the step cannot defer. */
export function isInstallIdentityFormReady(values: InstallIdentityFormValues): boolean {
  return (
    values.organizationName.trim().length > 0 &&
    values.organizationName.trim().length <= installIdentityLimits.organizationName &&
    values.appName.trim().length <= installIdentityLimits.appName &&
    isInstallTimeZoneSupported(values.timeZone)
  );
}

/**
 * Only filled fields travel: an empty optional field means "Podesi kasnije", so
 * it must not overwrite what an earlier save already stored. The logo data URL
 * is sent only when it was picked in this session — `logoConfigured` alone never
 * re-uploads anything.
 */
export function buildSaveInstallIdentityInput(
  values: InstallIdentityFormValues,
): SaveInstallIdentityInput {
  const supportEmail = values.supportEmail.trim();
  const supportUrl = values.supportUrl.trim();
  return {
    organizationName: values.organizationName.trim(),
    appName: values.appName.trim(),
    locale: values.locale,
    timeZone: values.timeZone.trim(),
    ...(values.logoDataUrl.length === 0 ? {} : { logoDataUrl: values.logoDataUrl }),
    ...(supportEmail.length === 0 ? {} : { supportEmail }),
    ...(supportUrl.length === 0 ? {} : { supportUrl }),
  };
}

/** What the live brand panel shows while the operator types. */
export function toInstallIdentityPreview(values: InstallIdentityFormValues): {
  readonly appName: string;
  readonly organizationName: string;
  readonly logoDataUrl: string;
  readonly hasLogo: boolean;
} {
  const appName = values.appName.trim() || "Service Desk";
  return {
    appName,
    organizationName: values.organizationName.trim(),
    logoDataUrl: values.logoDataUrl,
    // A logo stored earlier stays visible as "configured" without its bytes.
    hasLogo: values.logoDataUrl.length > 0 || values.logoConfigured,
  };
}
