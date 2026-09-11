import { changeLogEntityTypes } from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { requireChangeReason } from '../change-log/require-change-reason';
import { buildSettingChangeLogDiff } from '../settings/build-setting-change-log-diff';
import { settingKeys } from '../settings/setting-keys';
import { mapVisibilityToPersistence } from '../settings/settings.persistence-map';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from '../settings/settings-value';
import type {
  SettingDefinition,
  SettingsRegistry,
  SettingValue,
} from '../settings/settings.types';
import type { InstallCompletionPersistResult } from './install-complete.types';
import { isInstallSetupComplete } from './is-install-setup-complete';

type InstallCompletionTransaction = {
  readonly appSetting: {
    findUnique: (args: {
      where: { key: string };
      select: { value: true };
    }) => Promise<{ value: unknown } | null>;
    upsert: (args: {
      where: { key: string };
      create: {
        key: string;
        value: SettingValue;
        scope: 'PUBLIC' | 'PRIVATE';
        isSecret: boolean;
        description: string;
      };
      update: {
        value: SettingValue;
        scope: 'PUBLIC' | 'PRIVATE';
        isSecret: boolean;
        description: string;
      };
    }) => Promise<unknown>;
  };
  readonly changeLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export type InstallCompletionPrisma = {
  readonly $transaction: <T>(
    callback: (transaction: InstallCompletionTransaction) => Promise<T>,
  ) => Promise<T>;
};

export async function persistInstallCompletion(
  prisma: InstallCompletionPrisma,
  registry: SettingsRegistry,
  input: {
    readonly actorUserId: string;
    readonly completedAt: string;
    readonly reason: string;
  },
): Promise<InstallCompletionPersistResult> {
  const reason = requireChangeReason(input.reason);
  const completedAtDefinition = registry.requireDefinition(
    settingKeys.privateInstallCompletedAt,
  );
  const completedByDefinition = registry.requireDefinition(
    settingKeys.privateInstallCompletedByUserId,
  );
  const completedAt = validateSettingValue(
    completedAtDefinition,
    input.completedAt,
  );
  if (typeof completedAt !== 'string' || !isInstallSetupComplete(completedAt)) {
    throw new Error('Install completion timestamp must be a valid ISO datetime');
  }
  return prisma.$transaction(async (transaction) => {
    const stored = await transaction.appSetting.findUnique({
      where: { key: completedAtDefinition.key },
      select: { value: true },
    });
    const existingCompletedAt = stored?.value;
    if (
      typeof existingCompletedAt === 'string' &&
      isInstallSetupComplete(existingCompletedAt)
    ) {
      return {
        completedAt: existingCompletedAt,
        alreadyCompleted: true,
      };
    }
    const beforeValue =
      stored === null
        ? getSettingDefaultValue(completedAtDefinition)
        : validateSettingValue(completedAtDefinition, stored.value);
    await upsertInstallSetting(transaction, completedAtDefinition, completedAt);
    await upsertInstallSetting(
      transaction,
      completedByDefinition,
      input.actorUserId,
    );
    await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
      entityType: changeLogEntityTypes.setting,
      entityId: completedAtDefinition.key,
      reason,
      actorUserId: input.actorUserId,
      diff: buildSettingChangeLogDiff({
        definition: completedAtDefinition,
        action: stored === null ? 'create' : 'update',
        beforeValue,
        afterValue: completedAt,
      }),
    });
    return { completedAt, alreadyCompleted: false };
  });
}

async function upsertInstallSetting(
  transaction: InstallCompletionTransaction,
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
