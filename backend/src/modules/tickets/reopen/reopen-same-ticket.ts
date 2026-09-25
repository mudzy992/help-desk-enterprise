import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { assertTicketNotMerged } from '../merge/assert-ticket-editable';
import {
  propagateMergedStatus,
  syncPropagatedChildrenSla,
} from '../merge/propagate-merged-status';
import { recordTicketChange } from '../record-ticket-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { normalizeReopenComment } from './normalize-reopen-comment';
import { resolveTicketReopenPolicy } from './resolve-ticket-reopen-policy';
import type { ReopenTicketInput, TicketReopenConfiguration } from './reopen.types';

export async function reopenSameTicket(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly configuration: TicketReopenConfiguration;
  readonly ticketId: string;
  readonly body: ReopenTicketInput;
  readonly context: TicketMutationContext;
  readonly now: Date;
  readonly messages: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const { ticket } = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
    { writable: true },
  );
  if (!input.configuration.enabled) {
    throw new TicketsError('REOPEN_DISABLED');
  }
  // Package 1.2 (M3): a merged child is reopened through its parent.
  assertTicketNotMerged(ticket);
  const policy = resolveTicketReopenPolicy({
    ticket,
    configuration: input.configuration,
    now: input.now,
  });
  if (!policy.eligible || policy.mode !== 'same_ticket') {
    throw new TicketsError('REOPEN_NOT_ELIGIBLE');
  }
  const comment = normalizeReopenComment(input.body.comment);
  const timestamps = applyTicketLifecycleTimestamps({
    current: ticket,
    nextStatus: 'IN_PROGRESS',
    now: input.now,
  });
  const updated = (await input.prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'IN_PROGRESS', ...timestamps },
  })) as TicketRecord;
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: ticketChangeLogReasons.reopen,
    before: ticket,
    after: updated,
    actorUserId: input.context.actorUserId,
  });
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: updated.id,
      action: ticketSystemEventActions.ticketReopened,
      actorUserId: input.context.actorUserId,
    }),
  );
  if (comment !== null) {
    input.messages.push(
      await insertSystemTicketEvent(input.prisma, {
        ticketId: updated.id,
        action: comment,
        actorUserId: input.context.actorUserId,
      }),
    );
  }
  // Package 1.2 (M3): merged children follow the parent back into work.
  const propagated = await propagateMergedStatus({
    tx: input.prisma,
    parent: updated,
    previousStatus: ticket.status,
    actorUserId: input.context.actorUserId,
    messages: input.messages,
    now: input.now,
  });
  await syncPropagatedChildrenSla(input.context, propagated, input.now);
  return updated;
}
