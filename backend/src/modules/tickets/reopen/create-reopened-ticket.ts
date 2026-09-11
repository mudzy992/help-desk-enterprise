import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { RoutingService } from '../../routing/routing.service';
import type { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { createTicket } from '../create-ticket';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { normalizeReopenComment } from './normalize-reopen-comment';
import { resolveTicketReopenPolicy } from './resolve-ticket-reopen-policy';
import type { ReopenTicketInput, TicketReopenConfiguration } from './reopen.types';

export async function createReopenedTicket(input: {
  readonly prisma: PrismaService;
  readonly routingService: RoutingService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader;
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
  const policy = resolveTicketReopenPolicy({
    ticket,
    configuration: input.configuration,
    now: input.now,
  });
  if (!policy.eligible || policy.mode !== 'new_ticket') {
    throw new TicketsError('REOPEN_NOT_ELIGIBLE');
  }
  const comment = normalizeReopenComment(input.body.comment);
  const created = await createTicket(
    input.prisma,
    input.routingService,
    input.authorizationContextLoader,
    input.approvalsConfigurationLoader,
    {
      title: ticket.title,
      description: ticket.description,
      impact: ticket.impact,
      urgency: ticket.urgency,
      serviceId: ticket.serviceId,
      originUnitId: ticket.originUnitId,
      formVersionRef: ticket.formVersionId,
      formData: ticket.formData,
      requesterUserId: ticket.requesterId,
      reopenedFromTicketId: ticket.id,
    },
    input.context,
    input.messages,
  );
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: created.id,
      action: ticketSystemEventActions.ticketReopenedNew,
      actorUserId: input.context.actorUserId,
    }),
  );
  if (comment !== null) {
    input.messages.push(
      await insertSystemTicketEvent(input.prisma, {
        ticketId: created.id,
        action: comment,
        actorUserId: input.context.actorUserId,
      }),
    );
  }
  return created;
}
