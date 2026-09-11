import { changeLogEntityTypes } from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { requireChangeReason } from '../change-log/require-change-reason';
import { buildSettingChangeLogDiff } from '../settings/build-setting-change-log-diff';
import { settingKeys } from '../settings/setting-keys';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from '../settings/settings-value';
import type { SettingsRegistry } from '../settings/settings.types';
import { ensureInstallJwtSigningSecret } from './ensure-install-jwt-signing-secret';
import type {
  InstallCompletionPersistResult,
  InstallCompletionPrisma,
} from './install-complete.types';
import { isInstallSetupComplete } from './is-install-setup-complete';
import { upsertInstallSetting } from './upsert-install-setting';

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
    await ensureInstallJwtSigningSecret(transaction, registry, {
      actorUserId: input.actorUserId,
      reason,
    });
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
