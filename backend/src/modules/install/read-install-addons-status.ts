import {
  addonRequiresSmtp,
  installAddonCatalog,
} from '../settings/addon-catalog';
import type { SettingsService } from '../settings/settings.service';
import type {
  InstallAddonCatalogItem,
  InstallAddonsCatalogRecord,
  InstallAddonsPublicRecord,
} from './install-addons.types';
import {
  readSmtpEnabledForAddons,
  readStoredInstallAddons,
} from './persist-install-addons';
import { resolveInstallAddonsState } from './resolve-install-addons-state';

export async function readInstallAddonsStatus(
  settingsService: SettingsService,
): Promise<InstallAddonsPublicRecord> {
  return buildInstallAddonsStatus(settingsService, { publicOnly: false });
}

export async function readInstallAddonsCatalog(
  settingsService: SettingsService,
): Promise<InstallAddonsPublicRecord> {
  const smtpEnabled = await readSmtpEnabledForAddons(settingsService);
  return {
    smtpEnabled,
    items: installAddonCatalog.map((item) => ({
      key: item.key,
      enabled: item.defaultEnabled,
      defaultEnabled: item.defaultEnabled,
      canEnable: addonRequiresSmtp(item) ? smtpEnabled : true,
    })),
  };
}

async function buildInstallAddonsStatus(
  settingsService: SettingsService,
  options: { readonly publicOnly: boolean },
): Promise<InstallAddonsPublicRecord> {
  const smtpEnabled = await readSmtpEnabledForAddons(settingsService);
  const stored = options.publicOnly
    ? null
    : await readStoredInstallAddons(settingsService);
  const values =
    stored === null
      ? null
      : resolveInstallAddonsState({
          smtpEnabled,
          stored,
          requested: {},
        });
  return {
    smtpEnabled,
    items: installAddonCatalog.map((item) => ({
      key: item.key,
      enabled: values?.[item.key] ?? item.defaultEnabled,
      defaultEnabled: item.defaultEnabled,
      canEnable: addonRequiresSmtp(item) ? smtpEnabled : true,
    })),
  };
}
