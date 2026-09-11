import { mapVisibilityToPersistence } from '../settings/settings.persistence-map';
import { validateSettingValue } from '../settings/settings-value';
import type { SettingDefinition, SettingValue } from '../settings/settings.types';
import type { InstallSettingsWriteTransaction } from './install-complete.types';

export async function upsertInstallSetting(
  transaction: InstallSettingsWriteTransaction,
  definition: SettingDefinition,
  value: SettingValue,
): Promise<void> {
  const persistence = mapVisibilityToPersistence(definition.visibility);
  const validated = validateSettingValue(definition, value);
  await transaction.appSetting.upsert({
    where: { key: definition.key },
    create: {
      key: definition.key,
      value: validated,
      scope: persistence.scope,
      isSecret: persistence.isSecret,
      description: definition.description,
    },
    update: {
      value: validated,
      scope: persistence.scope,
      isSecret: persistence.isSecret,
      description: definition.description,
    },
  });
}
