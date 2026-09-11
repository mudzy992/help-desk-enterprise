import {
  isInstallAddonKey,
  type InstallAddonKey,
} from '../settings/addon-catalog';
import { installAddonsErrorCodes } from './install-addons.constants';
import { InstallAddonsError } from './install-addons.error';
import type {
  SaveInstallAddonsInput,
  ValidatedInstallAddons,
} from './install-addons.types';

export function validateInstallAddons(
  input: SaveInstallAddonsInput,
): ValidatedInstallAddons {
  if (!isAddonRecord(input.addons)) {
    throw new InstallAddonsError(installAddonsErrorCodes.invalidConfiguration);
  }
  const addons: Partial<Record<InstallAddonKey, boolean>> = {};
  for (const [key, value] of Object.entries(input.addons)) {
    if (!isInstallAddonKey(key)) {
      throw new InstallAddonsError(installAddonsErrorCodes.unsupportedAddon);
    }
    if (typeof value !== 'boolean') {
      throw new InstallAddonsError(installAddonsErrorCodes.invalidConfiguration);
    }
    addons[key] = value;
  }
  return { addons };
}

function isAddonRecord(
  value: SaveInstallAddonsInput['addons'],
): value is Readonly<Record<string, boolean>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
