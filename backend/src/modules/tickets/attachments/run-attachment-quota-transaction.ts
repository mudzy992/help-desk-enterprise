import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';

export function runAttachmentQuotaTransaction<T>(input: {
  prisma: PrismaService;
  ticketId: string;
  maxFiles: number;
  operation: (transaction: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  return input.prisma.$transaction(async (transaction) => {
    if (typeof transaction.$queryRaw === 'function') {
      await transaction.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${input.ticketId} FOR UPDATE`;
    }
    const count = await transaction.ticketAttachment.count({ where: { ticketId: input.ticketId } });
    if (count >= input.maxFiles) throw new TicketsError('ATTACHMENT_LIMIT_REACHED');
    return input.operation(transaction);
  });
}
