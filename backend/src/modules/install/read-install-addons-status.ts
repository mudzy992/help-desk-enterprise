import {
  addonRequiresSmtp,
  installAddonCatalog,
} from '../settings/addon-catalog';
import type { SettingsService } from '../settings/settings.service';
import type {
  InstallAddonsPublicRecord,
} from './install-addons.types';
import {
  readSmtpEnabledForAddons,
  readStoredInstallAddons,
} from './persist-install-addons';
import { resolveInstallAddonDefaults } from './resolve-install-addon-defaults';
import { resolveInstallAddonsState } from './resolve-install-addons-state';
import type { InstallProfile } from './steps/install-step.types';

export async function readInstallAddonsStatus(
  settingsService: SettingsService,
  profile: InstallProfile | null,
): Promise<InstallAddonsPublicRecord> {
  // F4.5: the wizard starts from the defaults of the chosen package, not from the
  // catalog defaults — „Standard“ promises CSAT, reports and saved views on.
  const defaults = resolveInstallAddonDefaults(profile);
  return buildInstallAddonsStatus(settingsService, { publicOnly: false, defaults });
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
  options: {
    readonly publicOnly: boolean;
    readonly defaults: Readonly<Record<string, boolean>>;
  },
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
      enabled: values?.[item.key] ?? options.defaults[item.key] ?? item.defaultEnabled,
      defaultEnabled: options.defaults[item.key] ?? item.defaultEnabled,
      canEnable: addonRequiresSmtp(item) ? smtpEnabled : true,
    })),
  };
}
