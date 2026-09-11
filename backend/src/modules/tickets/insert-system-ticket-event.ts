import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketMessageRecord } from './collaboration.types';

export async function insertSystemTicketEvent(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly action: string;
    readonly actorUserId: string | null;
  },
): Promise<TicketMessageRecord> {
  return prisma.ticketMessage.create({
    data: {
      ticketId: input.ticketId,
      type: 'SYSTEM_EVENT',
      body: input.action,
      authorUserId: input.actorUserId,
    },
  }) as Promise<TicketMessageRecord>;
}
