import {
  addonRequiresSmtp,
  installAddonCatalog,
} from '../settings/addon-catalog';
import type { SettingsService } from '../settings/settings.service';
import type { InstallAddonsPublicRecord } from './install-addons.types';
import {
  readSmtpEnabledForAddons,
  readStoredInstallAddons,
} from './persist-install-addons';
import { resolveInstallAddonsState } from './resolve-install-addons-state';

export async function readInstallAddonsStatus(
  settingsService: SettingsService,
): Promise<InstallAddonsPublicRecord> {
  const smtpEnabled = await readSmtpEnabledForAddons(settingsService);
  const values = resolveInstallAddonsState({
    smtpEnabled,
    stored: await readStoredInstallAddons(settingsService),
    requested: {},
  });
  return {
    smtpEnabled,
    items: installAddonCatalog.map((item) => ({
      key: item.key,
      enabled: values[item.key],
      defaultEnabled: item.defaultEnabled,
      canEnable: addonRequiresSmtp(item) ? smtpEnabled : true,
    })),
  };
}
