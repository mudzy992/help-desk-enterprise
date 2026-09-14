import type { SettingValue } from '../settings/settings.types';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import { isPlainObject } from './read-snapshot-primitives';

export function parseSettingsRecord(
  value: unknown,
): Readonly<Record<string, SettingValue>> {
  if (!isPlainObject(value)) {
    throw new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
  }
  const settings: Record<string, SettingValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry !== 'string' &&
      typeof entry !== 'number' &&
      typeof entry !== 'boolean'
    ) {
      throw new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
    }
    settings[key] = entry;
  }
  return settings;
}
