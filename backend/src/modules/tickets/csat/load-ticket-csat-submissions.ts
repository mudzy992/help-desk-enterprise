import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketCsatRecord } from './csat.types';

export async function loadTicketCsatSubmissions(
  prisma: PrismaService,
  ticketIds: readonly string[],
): Promise<ReadonlyMap<string, TicketCsatRecord>> {
  if (ticketIds.length === 0) {
    return new Map();
  }
  const rows = (await prisma.ticketCsat.findMany({
    where: { ticketId: { in: [...ticketIds] } },
  })) as TicketCsatRecord[];
  return new Map(rows.map((row) => [row.ticketId, row]));
}
