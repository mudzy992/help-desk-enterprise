import { PrismaService } from '../../common/prisma/prisma.service';
import { listChangeLogPage } from '../change-log/list-change-logs';
import type { SlaChangeLogResponse, SlaPage } from './sla.types';

export async function listSlaChangeLogs(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly cursor?: string;
    readonly take?: number;
  },
): Promise<SlaPage<SlaChangeLogResponse>> {
  let decodedCursor: { createdAt: Date; id: string } | undefined;
  if (input.cursor !== undefined) {
    const cursorRow = await prisma.changeLog.findUnique({ where: { id: input.cursor }, select: { createdAt: true, id: true } });
    decodedCursor = cursorRow ?? undefined;
  }
  const page = await listChangeLogPage(prisma, {
    entityType: input.entityType,
    entityId: input.entityId,
    take: input.take ?? 50,
    cursor: decodedCursor,
  });
  return {
    ...page,
    nextCursor: page.hasMore ? page.items.at(-1)?.id ?? null : null,
  };
}
