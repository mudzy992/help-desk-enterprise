import { changeLogEntityTypes } from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { buildSettingChangeLogDiff } from '../settings/build-setting-change-log-diff';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsRegistry, SettingValue } from '../settings/settings.types';
import type { InstallSettingsWriteTransaction } from './install-complete.types';
import {
  generateInstallJwtSigningSecret,
  isUsableJwtSigningSecret,
} from './install-jwt-signing-secret';
import { upsertInstallSetting } from './upsert-install-setting';

export async function ensureInstallJwtSigningSecret(
  transaction: InstallSettingsWriteTransaction,
  registry: SettingsRegistry,
  input: {
    readonly actorUserId: string;
    readonly reason: string;
  },
): Promise<{ created: boolean }> {
  const definition = registry.requireDefinition(
    settingKeys.privateAuthJwtSigningSecret,
  );
  const stored = await transaction.appSetting.findUnique({
    where: { key: definition.key },
    select: { value: true },
  });
  if (isUsableJwtSigningSecret(stored?.value)) {
    return { created: false };
  }
  const secret = generateInstallJwtSigningSecret();
  await upsertInstallSetting(transaction, definition, secret);
  await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
    entityType: changeLogEntityTypes.setting,
    entityId: definition.key,
    reason: input.reason,
    actorUserId: input.actorUserId,
    diff: buildSettingChangeLogDiff({
      definition,
      action: stored === null ? 'create' : 'update',
      beforeValue: readStoredJwtSigningSecret(stored?.value),
      afterValue: secret,
    }),
  });
  return { created: true };
}

function readStoredJwtSigningSecret(value: unknown): SettingValue | undefined {
  return typeof value === 'string' ? value : undefined;
}
