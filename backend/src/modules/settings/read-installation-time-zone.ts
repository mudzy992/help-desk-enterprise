import { defaultReportsTimeZone } from './definitions/reports-settings';
import { settingKeys } from './setting-keys';
import type { SettingsService } from './settings.service';

/**
 * The zone the reporting day starts in, as configured for this installation.
 *
 * The caller gets a usable zone name whatever happens: an unset value, a value
 * that is not a string, or a settings read that fails (Redis/DB trouble) all
 * fall back to `defaultReportsTimeZone`. A counter that is a day boundary off
 * is a wrong number; a settings outage must not turn into a failed dashboard.
 */
export async function readInstallationTimeZone(
  settingsService: SettingsService | undefined,
): Promise<string> {
  if (settingsService === undefined) {
    return defaultReportsTimeZone;
  }
  try {
    return normalizeTimeZone(
      await settingsService.getSetting(settingKeys.privateReportsTimeZone),
    );
  } catch {
    return defaultReportsTimeZone;
  }
}

/** Accepts only a zone name `Intl` knows; anything else becomes the default. */
export function normalizeTimeZone(candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return defaultReportsTimeZone;
  }
  const trimmed = candidate.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
  } catch {
    return defaultReportsTimeZone;
  }
  return trimmed;
}
