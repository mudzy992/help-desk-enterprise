import type { Prisma } from '../../generated/prisma/client';
import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type {
  ChangeLogPrismaClient,
  JsonValue,
} from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import type { ConfigSnapshot } from './config-versioning.types';

export async function recordConfigVersionChange(
  transaction: Prisma.TransactionClient,
  input: {
    readonly entityId: string;
    readonly reason: string;
    readonly actorUserId: string | null;
    readonly action: 'create' | 'update';
    readonly before: ConfigSnapshot | Record<string, never>;
    readonly after: ConfigSnapshot;
  },
): Promise<void> {
  await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
    entityType: changeLogEntityTypes.configVersion,
    entityId: input.entityId,
    reason: input.reason,
    actorUserId: input.actorUserId,
    diff: buildChangeLogDiff({
      action:
        input.action === 'create'
          ? changeLogActions.create
          : changeLogActions.update,
      resourceType: changeLogEntityTypes.configVersion,
      resourceId: input.entityId,
      before: input.before as JsonValue,
      after: input.after as JsonValue,
    }),
  });
}
