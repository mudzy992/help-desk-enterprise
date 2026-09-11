import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogErrorCodes,
} from '../change-log/change-log.constants';
import { ChangeLogError } from '../change-log/change-log.error';
import type {
  ChangeLogAction,
  ChangeLogPrismaClient,
  JsonValue,
} from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { requireChangeReason } from '../change-log/require-change-reason';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaError } from './sla.error';

export async function recordSlaChange(
  prisma: PrismaService,
  input: {
    readonly action: ChangeLogAction;
    readonly entityType: string;
    readonly entityId: string;
    readonly reason: string;
    readonly before: JsonValue;
    readonly after: JsonValue;
    readonly actorUserId: string | null;
  },
): Promise<void> {
  await recordChangeLog(prisma as unknown as ChangeLogPrismaClient, {
    entityType: input.entityType,
    entityId: input.entityId,
    reason: readRequiredReason(input.reason),
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

export function readRequiredReason(reason: string): string {
  try {
    return requireChangeReason(reason);
  } catch (error) {
    if (
      error instanceof ChangeLogError &&
      error.code === changeLogErrorCodes.reasonRequired
    ) {
      throw new SlaError('REASON_REQUIRED');
    }
    throw error;
  }
}

export { changeLogActions };
