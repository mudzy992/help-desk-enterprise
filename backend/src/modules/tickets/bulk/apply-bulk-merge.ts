import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import {
  auditBulkTicketChange,
  ticketChangeLogReasons,
  ticketSystemEventActions,
} from './audit-bulk-ticket-change';
import type { ExecuteTicketBulkInput } from './bulk.types';

export async function applyBulkMerge(input: {
  readonly prisma: PrismaService;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<readonly TicketRecord[]> {
  const parentId = input.body.parentTicketId?.trim() ?? '';
  const parent =
    input.tickets.find((ticket) => ticket.id === parentId) ?? null;
  if (parent === null) {
    throw new TicketsError('NOT_FOUND');
  }
  const children = input.tickets.filter((ticket) => ticket.id !== parent.id);
  if (children.length === 0) {
    throw new TicketsError('BULK_ACTION_NOT_ALLOWED');
  }
  const updated: TicketRecord[] = [parent];
  for (const child of children) {
    if (child.mergedIntoTicketId !== null) {
      throw new TicketsError('BULK_ACTION_NOT_ALLOWED');
    }
    const next = (await input.prisma.ticket.update({
      where: { id: child.id },
      data: { mergedIntoTicketId: parent.id },
    })) as TicketRecord;
    await auditBulkTicketChange({
      prisma: input.prisma,
      before: child,
      after: next,
      context: input.actor,
      reason: ticketChangeLogReasons.bulkMerge,
      action: `${ticketSystemEventActions.ticketBulkMerge}:${parent.ticketNumber}`,
      batchId: input.batchId,
      messages: input.messages,
    });
    updated.push(next);
  }
  await auditBulkTicketChange({
    prisma: input.prisma,
    before: parent,
    after: parent,
    context: input.actor,
    reason: ticketChangeLogReasons.bulkMerge,
    action: `${ticketSystemEventActions.ticketBulkMerge}:${children
      .map((child) => child.ticketNumber)
      .join(',')}`,
    batchId: input.batchId,
    messages: input.messages,
  });
  return updated;
}
