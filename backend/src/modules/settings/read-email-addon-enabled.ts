import { settingKeys } from './setting-keys';
import { resolveEmailAddonEnabled } from './resolve-email-addon-enabled';
import type { SettingsService } from './settings.service';

export async function readEmailAddonEnabled(
  settingsService: SettingsService,
): Promise<boolean> {
  const smtpEnabled = await settingsService.getSetting(
    settingKeys.privateSmtpEnabled,
  );
  const emailAddonEnabled = await settingsService.getSetting(
    settingKeys.privateAddonsEmail,
  );
  return resolveEmailAddonEnabled({
    smtpEnabled: smtpEnabled === true,
    emailAddonEnabled: emailAddonEnabled === true,
  });
}
