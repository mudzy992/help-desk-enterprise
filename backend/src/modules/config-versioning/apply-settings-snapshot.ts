import type { Prisma } from '../../generated/prisma/client';
import { mapVisibilityToPersistence } from '../settings/settings.persistence-map';
import type { SettingsRegistry } from '../settings/settings.types';
import type { ConfigSnapshot } from './config-versioning.types';

export async function applySettingsSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
  registry: SettingsRegistry,
): Promise<void> {
  for (const [key, value] of Object.entries(snapshot.settings)) {
    const definition = registry.getDefinition(key);
    if (definition === undefined || definition.visibility === 'secret') {
      continue;
    }
    const persistence = mapVisibilityToPersistence(definition.visibility);
    await transaction.appSetting.upsert({
      where: { key },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        scope: persistence.scope,
        isSecret: persistence.isSecret,
        description: definition.description,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        scope: persistence.scope,
        isSecret: persistence.isSecret,
        description: definition.description,
      },
    });
  }
}
