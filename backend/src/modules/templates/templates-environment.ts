import { readPublicAppUrl } from '../notifications/email/load-email-channel-configuration';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import type { TemplateEnvironment } from './build-template-variables';
import { templateLocales, type TemplateLocale } from './templates.constants';

async function readSetting(settings: SettingsService, key: string): Promise<unknown> {
  try {
    return await settings.getSetting(key);
  } catch {
    return undefined;
  }
}

export async function loadTemplateEnvironment(settings: SettingsService): Promise<TemplateEnvironment> {
  const [appName, timeZone] = await Promise.all([
    readSetting(settings, settingKeys.publicBrandingAppName),
    readInstallationTimeZone(settings),
  ]);
  return {
    appName: typeof appName === 'string' && appName.trim().length > 0 ? appName.trim() : 'EP-HelpDesk',
    publicUrl: readPublicAppUrl(),
    timeZone,
  };
}

export function isTemplateLocale(value: unknown): value is TemplateLocale {
  return typeof value === 'string' && (templateLocales as readonly string[]).includes(value);
}

/** T3: requester's language → installation default → bs. */
export async function resolveTemplateLocale(
  settings: SettingsService,
  requested: TemplateLocale | undefined,
  requesterLocale: string | null | undefined,
): Promise<TemplateLocale> {
  if (requested !== undefined) return requested;
  if (isTemplateLocale(requesterLocale)) return requesterLocale;
  const fallback = await readSetting(settings, settingKeys.privateI18nDefaultLocale);
  return isTemplateLocale(fallback) ? fallback : 'bs';
}
