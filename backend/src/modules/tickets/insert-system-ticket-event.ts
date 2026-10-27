import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketMessageRecord } from './collaboration.types';

export async function insertSystemTicketEvent(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly action: string;
    readonly actorUserId: string | null;
    readonly detail?: string | null;
    readonly idempotencyKey?: string;
  },
): Promise<TicketMessageRecord> {
  const body =
    input.detail !== undefined &&
    input.detail !== null &&
    input.detail.length > 0
      ? `${input.action}:${input.detail}`
      : input.action;
  const data = {
    ticketId: input.ticketId,
    type: 'SYSTEM_EVENT' as const,
    body,
    authorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
  };
  if (input.idempotencyKey !== undefined) {
    return prisma.ticketMessage.upsert({
      where: {
        ticketId_idempotencyKey: {
          ticketId: input.ticketId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: data,
      update: {},
    }) as Promise<TicketMessageRecord>;
  }
  return prisma.ticketMessage.create({ data }) as Promise<TicketMessageRecord>;
}
