import { RequestIdempotencyService } from '../../../common/idempotency/request-idempotency.service';
import { TransactionalOutboxService } from '../../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { assertTicketNotMerged } from '../merge/assert-ticket-editable';
import { propagateMergedStatus } from '../merge/propagate-merged-status';
import { recordTicketChange } from '../record-ticket-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { normalizeReopenComment } from './normalize-reopen-comment';
import { resolveTicketReopenPolicy } from './resolve-ticket-reopen-policy';
import type { ReopenTicketInput, TicketReopenConfiguration } from './reopen.types';

export const reopenSlaOutboxTopic = 'ticket.reopen.sla';

export async function reopenSameTicket(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly configuration: TicketReopenConfiguration;
  readonly ticketId: string;
  readonly idempotencyKey: string;
  readonly body: ReopenTicketInput;
  readonly context: TicketMutationContext;
  readonly now: Date;
  readonly messages: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const { ticket } = await loadAccessibleTicket(input.prisma, input.authorizationContextLoader, input.ticketId, input.context, { writable: true });
  const comment = normalizeReopenComment(input.body.comment);
  const commandMessages: TicketPersistedMessageSink = [];
  const supportsDurableCommands = input.prisma.idempotencyRecord !== undefined && input.prisma.outboxMessage !== undefined;
  const outbox = supportsDurableCommands ? new TransactionalOutboxService(input.prisma) : undefined;
  const operation = async (transaction: Prisma.TransactionClient) => {
    if (!input.configuration.enabled) throw new TicketsError('REOPEN_DISABLED');
    assertTicketNotMerged(ticket);
    const policy = resolveTicketReopenPolicy({ ticket, configuration: input.configuration, now: input.now });
    if (!policy.eligible || policy.mode !== 'same_ticket') throw new TicketsError('REOPEN_NOT_ELIGIBLE');
    const timestamps = applyTicketLifecycleTimestamps({ current: ticket, nextStatus: 'IN_PROGRESS', now: input.now });
    let updated: TicketRecord;
    if (supportsDurableCommands) {
      const claimed = await transaction.ticket.updateMany({
        where: { id: ticket.id, status: ticket.status, updatedAt: ticket.updatedAt },
        data: { status: 'IN_PROGRESS', ...timestamps },
      });
      if (claimed.count !== 1) throw new TicketsError('REOPEN_NOT_ELIGIBLE');
      updated = (await transaction.ticket.findUniqueOrThrow({ where: { id: ticket.id } })) as TicketRecord;
    } else {
      updated = (await transaction.ticket.update({ where: { id: ticket.id }, data: { status: 'IN_PROGRESS', ...timestamps } })) as TicketRecord;
    }
      await recordTicketChange(transaction as PrismaService, { action: changeLogActions.update, reason: ticketChangeLogReasons.reopen, before: ticket, after: updated, actorUserId: input.context.actorUserId });
      commandMessages.push(await insertSystemTicketEvent(transaction as PrismaService, { ticketId: updated.id, action: ticketSystemEventActions.ticketReopened, actorUserId: input.context.actorUserId }));
      if (comment !== null) commandMessages.push(await insertSystemTicketEvent(transaction as PrismaService, { ticketId: updated.id, action: comment, actorUserId: input.context.actorUserId }));
      const propagated = await propagateMergedStatus({ tx: transaction as PrismaService, parent: updated, previousStatus: ticket.status, actorUserId: input.context.actorUserId, messages: commandMessages, now: input.now });
      await outbox?.enqueue(transaction, {
        topic: reopenSlaOutboxTopic,
        dedupeKey: `${input.idempotencyKey}:parent`,
        payload: { ticketId: updated.id, previousStatus: ticket.status, now: input.now.toISOString(), event: 'status_changed' },
      });
      for (const change of propagated) {
        await outbox?.enqueue(transaction, {
          topic: reopenSlaOutboxTopic,
          dedupeKey: `${input.idempotencyKey}:${change.after.id}`,
          payload: { ticketId: change.after.id, previousStatus: change.before.status, now: input.now.toISOString(), event: 'merged' },
        });
      }
    return { statusCode: 200, body: { ticketId: updated.id } };
  };
  const result = supportsDurableCommands
    ? await new RequestIdempotencyService(input.prisma).execute({
        namespace: 'ticket.reopen.same',
        key: input.idempotencyKey,
        request: { ticketId: ticket.id, actorUserId: input.context.actorUserId, comment },
        operation,
      })
    : { ...(await input.prisma.$transaction(operation)), replayed: false };
  if (!result.replayed) input.messages.push(...commandMessages);
  const committed = await input.prisma.ticket.findUnique({ where: { id: result.body.ticketId } });
  if (committed === null) throw new TicketsError('NOT_FOUND');
  return committed as TicketRecord;
}
