import { SettingsError } from './settings.error';
import type { SettingDefinition, SettingValue } from './settings.types';

export function getSettingDefaultValue(
  definition: SettingDefinition,
): SettingValue | undefined {
  if (definition.visibility === 'secret') {
    return undefined;
  }
  return definition.defaultValue;
}

export function validateSettingValue(
  definition: SettingDefinition,
  value: unknown,
): SettingValue {
  if (definition.valueType === 'string') {
    if (typeof value !== 'string') {
      throw new SettingsError(`Setting ${definition.key} must be a string`);
    }
    if (
      definition.allowedValues !== undefined &&
      !definition.allowedValues.includes(value)
    ) {
      throw new SettingsError(
        `Setting ${definition.key} must be one of: ${definition.allowedValues.join(', ')}`,
      );
    }
    return value;
  }
  if (definition.valueType === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new SettingsError(`Setting ${definition.key} must be a number`);
    }
    return value;
  }
  if (typeof value !== 'boolean') {
    throw new SettingsError(`Setting ${definition.key} must be a boolean`);
  }
  return value;
}
