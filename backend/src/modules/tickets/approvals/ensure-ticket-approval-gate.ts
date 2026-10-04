import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import type { TicketRecord } from '../tickets.types';
import { createPendingTicketApproval } from './create-pending-ticket-approval';
import { resolveTicketApprovalRequirement } from './resolve-ticket-approval-requirement';
import type { TicketApprovalsConfiguration } from './approvals.types';

/**
 * Val 2 (M9/B2). A service that requires approval only gated tickets that were
 * routed at creation time: `resolveCreateTicketApprovalStatus` leaves a ticket
 * in `UNROUTED` when no routing rule matched, and nothing re-checked the gate
 * when the ticket later entered processing (`UNROUTED → PENDING` via forward).
 * The sensitive service was then worked on without any approval and without a
 * trace in `TicketApproval`.
 *
 * This guard runs on the transition *into* processing: the ticket asks for an
 * approval, no approval row exists yet, and the status is moved to
 * `PENDING_APPROVAL` with the usual system event. A ticket that already passed
 * the gate (any approval row, whatever the outcome) is never gated twice.
 */
export async function ensureTicketApprovalGate(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly configuration: TicketApprovalsConfiguration;
  readonly serviceRequiresApproval: boolean;
  readonly actorUserId: string;
  readonly messages: TicketPersistedMessageSink;
}): Promise<{ readonly ticket: TicketRecord; readonly gated: boolean }> {
  const requiresApproval = resolveTicketApprovalRequirement({
    configuration: input.configuration,
    serviceId: input.ticket.serviceId,
    serviceRequiresApproval: input.serviceRequiresApproval,
  });
  if (!requiresApproval || input.ticket.status === 'PENDING_APPROVAL') {
    return { ticket: input.ticket, gated: false };
  }
  const existing = await input.prisma.ticketApproval.findFirst({
    where: { ticketId: input.ticket.id },
    select: { id: true },
  });
  if (existing !== null) {
    return { ticket: input.ticket, gated: false };
  }
  const updated = (await input.prisma.ticket.update({
    where: { id: input.ticket.id },
    data: { status: 'PENDING_APPROVAL' },
  })) as TicketRecord;
  await createPendingTicketApproval(input.prisma, updated);
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: updated.id,
      action: ticketSystemEventActions.approvalRequested,
      actorUserId: input.actorUserId,
    }),
  );
  return { ticket: updated, gated: true };
}
