import { PrismaService } from '../../common/prisma/prisma.service';
import type { ChangeLogListEntry } from '../change-log/list-change-logs';
import { listChangeLogs } from '../change-log/list-change-logs';
import type { SlaChangeLogResponse } from './sla.types';

export async function listSlaChangeLogs(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId: string;
  },
): Promise<readonly SlaChangeLogResponse[]> {
  const entries: readonly ChangeLogListEntry[] = await listChangeLogs(prisma, {
    entityType: input.entityType,
    entityId: input.entityId,
  });
  return entries;
}
