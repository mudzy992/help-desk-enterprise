import { PrismaService } from '../../common/prisma/prisma.service';
import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type {
  ChangeLogAction,
  ChangeLogPrismaClient,
  JsonValue,
} from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';

export async function recordCollaborationChange(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly action: ChangeLogAction;
    readonly reason: string;
    readonly before: JsonValue;
    readonly after: JsonValue;
    readonly actorUserId: string | null;
  },
): Promise<void> {
  await recordChangeLog(prisma as unknown as ChangeLogPrismaClient, {
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason,
    actorUserId: input.actorUserId,
    diff: buildChangeLogDiff({
      action: input.action,
      resourceType: input.entityType,
      resourceId: input.entityId,
      before: input.before,
      after: input.after,
    }),
  });
}

export { changeLogActions, changeLogEntityTypes };
