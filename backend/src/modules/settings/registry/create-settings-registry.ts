import { SettingsError } from '../settings.error';
import type {
  SettingDefinition,
  SettingsRegistry,
  SettingValue,
  SettingVisibility,
} from '../settings.types';

function isKnownVisibility(value: string): value is SettingVisibility {
  return value === 'public' || value === 'private' || value === 'secret';
}

function matchesValueType(
  valueType: SettingDefinition['valueType'],
  value: SettingValue,
): boolean {
  return typeof value === valueType;
}

function getDefaultValue(
  definition: SettingDefinition,
): SettingValue | undefined {
  if (definition.visibility === 'secret') {
    return undefined;
  }
  return definition.defaultValue;
}

function assertValidDefinition(
  definition: SettingDefinition,
  seenKeys: Set<string>,
): void {
  if (!isKnownVisibility(definition.visibility)) {
    throw new SettingsError(
      `Invalid setting visibility for key: ${definition.key}`,
    );
  }
  if (definition.key.trim() === '') {
    throw new SettingsError('Setting definition is missing a key');
  }
  if (seenKeys.has(definition.key)) {
    throw new SettingsError(`Duplicate setting key: ${definition.key}`);
  }
  seenKeys.add(definition.key);
  if (definition.allowedValues !== undefined) {
    if (definition.valueType !== 'string') {
      throw new SettingsError(
        `Setting ${definition.key} may only declare allowedValues when valueType is string`,
      );
    }
    if (definition.allowedValues.length === 0) {
      throw new SettingsError(
        `Setting ${definition.key} allowedValues must not be empty`,
      );
    }
  }
  const defaultValue = getDefaultValue(definition);
  if (definition.visibility === 'secret' && 'defaultValue' in definition) {
    throw new SettingsError(
      `Secret setting ${definition.key} must not declare a default value`,
    );
  }
  if (defaultValue === undefined) {
    return;
  }
  if (!matchesValueType(definition.valueType, defaultValue)) {
    throw new SettingsError(
      `Setting ${definition.key} default value does not match valueType ${definition.valueType}`,
    );
  }
  if (
    definition.allowedValues !== undefined &&
    typeof defaultValue === 'string' &&
    !definition.allowedValues.includes(defaultValue)
  ) {
    throw new SettingsError(
      `Setting ${definition.key} default value is not in allowedValues`,
    );
  }
}

export function createSettingsRegistry(
  definitions: readonly SettingDefinition[],
): SettingsRegistry {
  const seenKeys = new Set<string>();
  for (const definition of definitions) {
    assertValidDefinition(definition, seenKeys);
  }
  const definitionsByKey = new Map(
    definitions.map((definition) => [definition.key, definition]),
  );
  return {
    definitions: Object.freeze([...definitions]),
    getDefinition(key: string): SettingDefinition | undefined {
      return definitionsByKey.get(key);
    },
    requireDefinition(key: string): SettingDefinition {
      const definition = definitionsByKey.get(key);
      if (!definition) {
        throw new SettingsError(`Unknown setting key: ${key}`);
      }
      return definition;
    },
    listByVisibility(visibility: SettingVisibility): readonly SettingDefinition[] {
      return definitions.filter(
        (definition) => definition.visibility === visibility,
      );
    },
  };
}
