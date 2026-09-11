import { PrismaService } from '../../common/prisma/prisma.service';
import type { ChangeLogDiffPayload } from '../change-log/change-log.types';
import type { SlaChangeLogResponse } from './sla.types';

export async function listSlaChangeLogs(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId: string;
  },
): Promise<readonly SlaChangeLogResponse[]> {
  const entries = await prisma.changeLog.findMany({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      actor: {
        select: { displayName: true },
      },
    },
  });
  return entries.map((entry) => ({
    id: entry.id,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reason: entry.reason,
    actorUserId: entry.actorUserId,
    actorDisplayName: entry.actor?.displayName ?? null,
    createdAt: entry.createdAt.toISOString(),
    diff: entry.diff as unknown as ChangeLogDiffPayload,
  }));
}
