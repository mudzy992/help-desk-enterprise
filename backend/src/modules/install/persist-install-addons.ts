import {
  addonSettingKey,
  installAddonCatalog,
  type InstallAddonKey,
} from '../settings/addon-catalog';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsMutationInput } from '../settings/settings.types';
import type { SettingsService } from '../settings/settings.service';

export async function persistInstallAddons(
  settingsService: SettingsService,
  values: Readonly<Record<InstallAddonKey, boolean>>,
  mutation: SettingsMutationInput,
): Promise<void> {
  for (const item of installAddonCatalog) {
    await settingsService.setSettingValue(
      addonSettingKey(item.key),
      values[item.key],
      mutation,
    );
  }
}

export async function readStoredInstallAddons(
  settingsService: SettingsService,
): Promise<Readonly<Record<InstallAddonKey, boolean>>> {
  const stored = {} as Record<InstallAddonKey, boolean>;
  for (const item of installAddonCatalog) {
    stored[item.key] =
      (await settingsService.getSetting(addonSettingKey(item.key))) === true;
  }
  return stored;
}

export async function readSmtpEnabledForAddons(
  settingsService: SettingsService,
): Promise<boolean> {
  return (
    (await settingsService.getSetting(settingKeys.privateSmtpEnabled)) === true
  );
}
