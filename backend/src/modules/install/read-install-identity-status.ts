import { brandingLimits } from '../branding/branding.constants';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { defaultReportsTimeZone } from '../settings/definitions/reports-settings';
import { isInstallIdentityLocale } from './validate-install-identity';
import type {
  InstallIdentityLocale,
  InstallIdentityPublicRecord,
} from './install-identity.types';

/**
 * Install wizard v2 (F2): reads the identity back the same way the sign-in page
 * will. Defaults are shown as if they were stored (`Service Desk`, `bs`,
 * `Europe/Sarajevo`) so the form opens pre-filled, while `isConfigured` stays
 * false until the operator actually saved the organisation name.
 */
export async function readInstallIdentityStatus(
  settingsService: SettingsService,
): Promise<InstallIdentityPublicRecord> {
  const [
    organizationName,
    appName,
    tagline,
    locale,
    timeZone,
    logo,
    supportEmail,
    supportUrl,
  ] = await Promise.all([
    readString(settingsService, settingKeys.publicBrandingOrganizationName),
    readString(settingsService, settingKeys.publicBrandingAppName),
    readString(settingsService, settingKeys.publicBrandingTagline),
    readString(settingsService, settingKeys.privateI18nDefaultLocale),
    readString(settingsService, settingKeys.privateReportsTimeZone),
    readString(settingsService, settingKeys.publicBrandingLogoDataUrl),
    readString(settingsService, settingKeys.publicBrandingSupportEmail),
    readString(settingsService, settingKeys.publicBrandingSupportUrl),
  ]);
  const resolvedOrganizationName = organizationName?.trim() ?? '';
  return {
    organizationName: resolvedOrganizationName,
    appName: appName?.trim() || 'Service Desk',
    tagline: tagline?.trim() ?? '',
    locale: resolveLocale(locale),
    timeZone: timeZone?.trim() || defaultReportsTimeZone,
    // The data URL never leaves the server through the wizard: it can be
    // hundreds of kilobytes, and the step only needs to know whether one exists.
    logoConfigured: (logo ?? '').length > 0,
    supportEmail: supportEmail?.trim() ?? '',
    supportUrl: supportUrl?.trim() ?? '',
    isConfigured: resolvedOrganizationName.length > 0,
  };
}

export function resolveLocale(value: string | null | undefined): InstallIdentityLocale {
  return isInstallIdentityLocale(value) ? value : 'bs';
}

/** F2: appName is the only field with a shipped default the wizard must show. */
export const installIdentityDefaults = {
  appNameFallback: 'Service Desk',
  localeFallback: 'bs',
  maxAppNameLength: brandingLimits.appNameMaxLength,
  maxOrganizationNameLength: brandingLimits.organizationNameMaxLength,
} as const;

async function readString(
  settingsService: SettingsService,
  key: string,
): Promise<string | null> {
  const stored = await settingsService.getSetting(key);
  return typeof stored === 'string' ? stored : null;
}
