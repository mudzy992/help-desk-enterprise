import { changeLogEntityTypes } from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { requireChangeReason } from '../change-log/require-change-reason';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildSettingChangeLogDiff } from './build-setting-change-log-diff';
import { mapVisibilityToPersistence } from './settings.persistence-map';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from './settings-value';
import { mapChangeLogErrorToSettingsError } from './settings.error';
import type {
  SettingDefinition,
  SettingsMutationInput,
  SettingValue,
} from './settings.types';

export async function persistSettingValue(
  prisma: PrismaService,
  definition: SettingDefinition,
  value: SettingValue,
  mutation: SettingsMutationInput,
): Promise<void> {
  const reason = readRequiredReason(mutation.reason);
  const validated = validateSettingValue(definition, value);
  const persistence = mapVisibilityToPersistence(definition.visibility);
  await prisma.$transaction(async (transaction) => {
    const stored = await transaction.appSetting.findUnique({
      where: { key: definition.key },
      select: { value: true },
    });
    const beforeValue =
      stored === null
        ? getSettingDefaultValue(definition)
        : validateSettingValue(definition, stored.value);
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
    await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
      entityType: changeLogEntityTypes.setting,
      entityId: definition.key,
      reason,
      actorUserId: mutation.actorUserId,
      diff: buildSettingChangeLogDiff({
        definition,
        action: stored === null ? 'create' : 'update',
        beforeValue,
        afterValue: validated,
      }),
    });
  });
}

function readRequiredReason(reason: string): string {
  try {
    return requireChangeReason(reason);
  } catch (error) {
    mapChangeLogErrorToSettingsError(error);
  }
}
