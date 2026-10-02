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
  await persistSettingValues(prisma, [{ definition, value }], mutation);
}

/**
 * Paket 4.1: several keys under one reason, all-or-nothing. Every value is
 * validated before anything is written, then all rows and change-log entries
 * go into a single transaction (one change-log entry per key, as before).
 */
export async function persistSettingValues(
  prisma: PrismaService,
  items: readonly { readonly definition: SettingDefinition; readonly value: SettingValue }[],
  mutation: SettingsMutationInput,
): Promise<readonly SettingValue[]> {
  const reason = readRequiredReason(mutation.reason);
  const validated = items.map((item) => validateSettingValue(item.definition, item.value));
  await prisma.$transaction(async (transaction) => {
    for (const [index, { definition }] of items.entries()) {
      await writeSetting(transaction, definition, validated[index], reason, mutation.actorUserId);
    }
  });
  return validated;
}

async function writeSetting(
  transaction: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  definition: SettingDefinition,
  validated: SettingValue,
  reason: string,
  actorUserId: string | null,
): Promise<void> {
  const persistence = mapVisibilityToPersistence(definition.visibility);
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
    actorUserId,
    diff: buildSettingChangeLogDiff({
      definition,
      action: stored === null ? 'create' : 'update',
      beforeValue,
      afterValue: validated,
    }),
  });
}

function readRequiredReason(reason: string): string {
  try {
    return requireChangeReason(reason);
  } catch (error) {
    mapChangeLogErrorToSettingsError(error);
  }
}
