import type {
  ChangeLogDiffPayload,
  ChangeLogPrismaClient,
  RecordChangeLogInput,
} from './change-log.types';

export async function recordChangeLog(
  prisma: ChangeLogPrismaClient,
  input: RecordChangeLogInput,
): Promise<void> {
  await prisma.changeLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      diff: toPersistedDiff(input.diff),
      actorUserId: input.actorUserId,
      scopeOriginUnitId: input.scopeOriginUnitId,
      scopeServiceId: input.scopeServiceId,
    } as Record<string, unknown>,
  });
}

function toPersistedDiff(diff: ChangeLogDiffPayload): ChangeLogDiffPayload {
  return JSON.parse(JSON.stringify(diff)) as ChangeLogDiffPayload;
}
