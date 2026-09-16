import type { PrismaService } from '../../common/prisma/prisma.service';
import { redactedSecretPlaceholder } from './settings.redaction';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from './settings-value';
import type {
  SettingDefinition,
  SettingRegistryEntry,
  SettingsRegistry,
  SettingValue,
} from './settings.types';

export async function listSettingsRegistry(
  prisma: PrismaService,
  registry: SettingsRegistry,
): Promise<readonly SettingRegistryEntry[]> {
  const storedRows = await prisma.appSetting.findMany({
    select: { key: true, value: true },
  });
  const storedByKey = new Map(
    storedRows.map((row) => [row.key, row.value] as const),
  );
  return registry.definitions.map((definition) =>
    toRegistryEntry(definition, storedByKey),
  );
}

function toRegistryEntry(
  definition: SettingDefinition,
  storedByKey: ReadonlyMap<string, unknown>,
): SettingRegistryEntry {
  const hasStored = storedByKey.has(definition.key);
  if (definition.visibility === 'secret') {
    return {
      key: definition.key,
      description: definition.description,
      valueType: definition.valueType,
      visibility: definition.visibility,
      isRequired: definition.isRequired,
      defaultValue: null,
      value: hasStored ? redactedSecretPlaceholder : null,
      isSet: hasStored,
      allowedValues: definition.allowedValues
        ? [...definition.allowedValues]
        : undefined,
    };
  }
  const resolved = resolveNonSecretValue(definition, storedByKey);
  return {
    key: definition.key,
    description: definition.description,
    valueType: definition.valueType,
    visibility: definition.visibility,
    isRequired: definition.isRequired,
    defaultValue: getSettingDefaultValue(definition) ?? null,
    value: resolved,
    isSet: hasStored,
    allowedValues: definition.allowedValues
      ? [...definition.allowedValues]
      : undefined,
  };
}

function resolveNonSecretValue(
  definition: SettingDefinition,
  storedByKey: ReadonlyMap<string, unknown>,
): SettingValue | null {
  const stored = storedByKey.get(definition.key);
  if (stored !== undefined) {
    return validateSettingValue(definition, stored);
  }
  return getSettingDefaultValue(definition) ?? null;
}
