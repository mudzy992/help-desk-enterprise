import type { PrismaService } from '../../common/prisma/prisma.service';
import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import type {
  ChangeLogAction,
  ChangeLogPrismaClient,
  JsonValue,
} from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';

/** A3: every change of a template, playbook or ticket checklist is logged. */
export async function recordTemplatesChange(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly action: ChangeLogAction;
    readonly reason: string;
    readonly before: unknown;
    readonly after: unknown;
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
      before: toJson(input.before),
      after: toJson(input.after),
    }),
  });
}

function toJson(value: unknown): JsonValue {
  return value === null || value === undefined
    ? {}
    : (JSON.parse(JSON.stringify(value)) as JsonValue);
}
