import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPriority } from '../../../generated/prisma/enums';
import { calculateTicketPriority } from '../calculate-ticket-priority';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import {
  auditBulkTicketChange,
  ticketChangeLogReasons,
  ticketSystemEventActions,
} from './audit-bulk-ticket-change';
import type { ExecuteTicketBulkInput } from './bulk.types';

export async function applyBulkPriority(input: {
  readonly prisma: PrismaService;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<readonly TicketRecord[]> {
  const priority = input.body.priority;
  if (priority === undefined) {
    throw new TicketsError('BULK_ACTION_NOT_ALLOWED');
  }
  const reason = input.body.reason?.trim() ?? '';
  if (reason.length === 0) {
    throw new TicketsError('BULK_REASON_REQUIRED');
  }
  const updated: TicketRecord[] = [];
  for (const ticket of input.tickets) {
    const next = (await input.prisma.ticket.update({
      where: { id: ticket.id },
      data: impactUrgencyForPriority(priority),
    })) as TicketRecord;
    await auditBulkTicketChange({
      prisma: input.prisma,
      before: ticket,
      after: next,
      context: input.actor,
      reason: ticketChangeLogReasons.bulkPriority,
      action: `${ticketSystemEventActions.ticketBulkPriority}:${reason}`,
      batchId: input.batchId,
      messages: input.messages,
    });
    updated.push(next);
  }
  return updated;
}

function impactUrgencyForPriority(priority: TicketPriority): {
  readonly impact: TicketPriority;
  readonly urgency: TicketPriority;
  readonly priority: TicketPriority;
} {
  return {
    impact: priority,
    urgency: priority,
    priority: calculateTicketPriority(priority, priority),
  };
}
