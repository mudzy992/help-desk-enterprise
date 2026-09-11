import type { InstallAddonKey } from '../settings/addon-catalog';

export type SaveInstallAddonsInput = {
  readonly addons: Readonly<Record<string, boolean>>;
};

export type ValidatedInstallAddons = {
  readonly addons: Readonly<Partial<Record<InstallAddonKey, boolean>>>;
};

export type InstallAddonPublicItem = {
  readonly key: InstallAddonKey;
  readonly enabled: boolean;
  readonly defaultEnabled: boolean;
  readonly canEnable: boolean;
};

export type InstallAddonsPublicRecord = {
  readonly smtpEnabled: boolean;
  readonly items: readonly InstallAddonPublicItem[];
};

export type InstallAddonsStatus = {
  readonly addons: InstallAddonsPublicRecord;
};
