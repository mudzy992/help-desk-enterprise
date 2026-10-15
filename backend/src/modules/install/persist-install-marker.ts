import { changeLogEntityTypes } from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { buildSettingChangeLogDiff } from '../settings/build-setting-change-log-diff';
import { invalidateConfigurationCachesAfter } from '../settings/invalidate-configuration-caches';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from '../settings/settings-value';
import type { SettingValue, SettingsRegistry } from '../settings/settings.types';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { InstallSettingsWriteTransaction } from './install-complete.types';
import { upsertInstallSetting } from './upsert-install-setting';

/**
 * F4: the install steps keep a one-line „what did I do“ marker in
 * `private.install.*` (the blueprint and the policy pack that were applied, the
 * SLA review that was answered). Every marker is written the same way — the same
 * transaction, change-log entry and cache invalidation the completion timestamp
 * gets — so the wizard's status read can trust that a non-empty value means the
 * step really ran.
 *
 * The parameter is the real `PrismaService`, not the narrow `InstallCompletionPrisma`
 * shape `persistInstallCompletion` uses: that shape exists so tests can pass an
 * in-memory double, and the real client's overloaded `$transaction` is *not*
 * assignable to it — every caller would have to cast (`nest build` caught exactly
 * that after F4). Here the service itself is the only caller, so it takes the
 * service and no cast is needed anywhere.
 */
export async function persistInstallMarker(
  prisma: PrismaService,
  registry: SettingsRegistry,
  input: {
    readonly key: string;
    readonly value: SettingValue;
    readonly actorUserId: string;
    readonly reason: string;
  },
): Promise<void> {
  const definition = registry.requireDefinition(input.key);
  await invalidateConfigurationCachesAfter(
    prisma.$transaction(async (transaction) => {
      const stored = await transaction.appSetting.findUnique({
        where: { key: definition.key },
        select: { value: true },
      });
      const beforeValue = validateSettingValue(
        definition,
        stored === null
          ? (getSettingDefaultValue(definition) ?? '')
          : stored.value,
      );
      await upsertInstallSetting(
        transaction as unknown as InstallSettingsWriteTransaction,
        definition,
        input.value,
      );
      await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
        entityType: changeLogEntityTypes.setting,
        entityId: definition.key,
        reason: input.reason,
        actorUserId: input.actorUserId,
        diff: buildSettingChangeLogDiff({
          definition,
          action: stored === null ? 'create' : 'update',
          beforeValue,
          afterValue: input.value,
        }),
      });
    }),
  );
}
