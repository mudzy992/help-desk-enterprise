import type { InstallAddonKey } from '../settings/addon-catalog';

export type SaveInstallAddonsInput = {
  readonly addons: Readonly<Record<string, boolean>>;
};

export type ValidatedInstallAddons = {
  readonly addons: Readonly<Partial<Record<InstallAddonKey, boolean>>>;
};

export type InstallAddonCatalogItem = {
  readonly key: InstallAddonKey;
  readonly defaultEnabled: boolean;
  readonly canEnable: boolean;
};

export type InstallAddonPublicItem = InstallAddonCatalogItem & {
  readonly enabled: boolean;
};

export type InstallAddonsCatalogRecord = {
  readonly smtpEnabled: boolean;
  readonly items: readonly InstallAddonCatalogItem[];
};

export type InstallAddonsPublicRecord = {
  readonly smtpEnabled: boolean;
  readonly items: readonly InstallAddonPublicItem[];
};

export type InstallAddonsStatus = {
  readonly addons: InstallAddonsPublicRecord;
};

export type InstallAddonsCatalogStatus = {
  readonly addons: InstallAddonsCatalogRecord;
};
