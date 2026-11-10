import type { Prisma } from '../../generated/prisma/client';
import type { SettingsRegistry } from '../settings/settings.types';
import { applyConfigSnapshot } from './apply-config-snapshot';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';
import { recordConfigVersionAudit } from './record-config-version-audit';
import { recordConfigVersionChange } from './record-config-version-change';
import type { ConfigVersionRecord } from './to-config-version-response';

export async function persistActivatedConfigVersion(
  transaction: Prisma.TransactionClient,
  input: {
    readonly candidate: ConfigVersionRecord;
    readonly snapshot: ConfigSnapshot;
    readonly previousActive: ConfigVersionRecord | null;
    readonly previousStatus: 'VALIDATED' | 'ROLLED_BACK';
    readonly reason: string;
    readonly actorUserId: string | null;
    readonly auditAction: string;
    readonly registry: SettingsRegistry;
  },
): Promise<void> {
  if (input.candidate.status === 'ACTIVE') {
    throw new ConfigVersioningError(configVersioningErrorCodes.alreadyActive);
  }
  await applyConfigSnapshot(transaction, input.snapshot, input.registry);
  if (input.previousActive !== null) {
    await transaction.configVersion.update({
      where: { id: input.previousActive.id },
      data: { status: input.previousStatus },
    });
  }
  await transaction.configVersion.update({
    where: { id: input.candidate.id },
    data: { status: 'ACTIVE', activatedAt: new Date() },
  });
  await recordConfigVersionChange(transaction, {
    entityId: input.candidate.id,
    reason: input.reason,
    actorUserId: input.actorUserId,
    action: 'update',
    before: {},
    after: input.snapshot,
  });
  await recordConfigVersionAudit(transaction, {
    action: input.auditAction,
    entityId: input.candidate.id,
    actorUserId: input.actorUserId,
    metadata: {
      reason: input.reason,
      version: input.candidate.version,
      rollbackOfVersion: input.snapshot.rollbackOfVersion,
    },
  });
}
