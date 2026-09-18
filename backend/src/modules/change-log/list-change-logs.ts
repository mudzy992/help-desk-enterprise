import { PrismaService } from '../../common/prisma/prisma.service';
import type { ChangeLogDiffPayload } from './change-log.types';

export type ChangeLogListEntry = {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly createdAt: string;
  readonly diff: ChangeLogDiffPayload;
};

export async function listChangeLogs(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId?: string;
  },
): Promise<readonly ChangeLogListEntry[]> {
  const entries = await prisma.changeLog.findMany({
    where: {
      entityType: input.entityType,
      ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
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
