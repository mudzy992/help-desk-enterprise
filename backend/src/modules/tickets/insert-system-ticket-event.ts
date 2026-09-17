import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketMessageRecord } from './collaboration.types';

export async function insertSystemTicketEvent(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly action: string;
    readonly actorUserId: string | null;
    readonly detail?: string | null;
  },
): Promise<TicketMessageRecord> {
  const body =
    input.detail !== undefined &&
    input.detail !== null &&
    input.detail.length > 0
      ? `${input.action}:${input.detail}`
      : input.action;
  return prisma.ticketMessage.create({
    data: {
      ticketId: input.ticketId,
      type: 'SYSTEM_EVENT',
      body,
      authorUserId: input.actorUserId,
    },
  }) as Promise<TicketMessageRecord>;
}
