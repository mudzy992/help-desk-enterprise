import type { SettingsService } from '../settings/settings.service';
import { readOptionalInstallString } from './read-optional-install-string';

/**
 * F4: reads a `private.install.*` marker the wizard wrote (`persistInstallMarker`).
 * A missing, empty or non-string value is „the step did not run yet“ — never a
 * throw, because the wizard asks for these while walking a half-finished
 * installation.
 */
export async function readInstallMarker(
  settingsService: SettingsService,
  key: string,
): Promise<string | null> {
  const stored = await settingsService.getSetting(key);
  return readOptionalInstallString(stored) ?? null;
}
