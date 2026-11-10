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
import type { ServiceFormsConfiguration } from '../../service-catalog/service-forms.types';
import { normalizeReopenComment } from './normalize-reopen-comment';
import { resolveTicketReopenPolicy } from './resolve-ticket-reopen-policy';
import type { ReopenTicketInput, TicketReopenConfiguration } from './reopen.types';

export async function createReopenedTicket(input: {
  readonly prisma: PrismaService;
  readonly routingService: RoutingService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader;
  readonly configuration: TicketReopenConfiguration;
  readonly formsConfiguration: ServiceFormsConfiguration;
  readonly ticketId: string;
  readonly body: ReopenTicketInput;
  readonly context: TicketMutationContext;
  readonly now: Date;
  readonly idempotencyKey: string;
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
  const sourceInboundEmailId = input.context.sourceInboundEmailId;
  let created = sourceInboundEmailId === undefined
    ? null
    : await input.prisma.ticket.findUnique({ where: { sourceInboundEmailId } }) as TicketRecord | null;
  if (created === null) {
    try {
      created = await createTicket(
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
          formVersionRef: ticket.formVersionId ?? undefined,
          formData: input.formsConfiguration.enabled ? ticket.formData : undefined,
          requesterUserId: ticket.requesterId,
          reopenedFromTicketId: ticket.id,
        },
        input.context,
        input.messages,
        undefined,
        undefined,
        [],
        input.formsConfiguration,
      );
    } catch (error) {
      if (sourceInboundEmailId === undefined || !isUniqueConstraintError(error)) throw error;
      created = await input.prisma.ticket.findUnique({ where: { sourceInboundEmailId } }) as TicketRecord | null;
      if (created === null) throw error;
    }
  }
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: created.id,
      action: ticketSystemEventActions.ticketReopenedNew,
      actorUserId: input.context.actorUserId,
      idempotencyKey: `${input.idempotencyKey}:reopened`,
    }),
  );
  if (comment !== null) {
    input.messages.push(
      await insertSystemTicketEvent(input.prisma, {
        ticketId: created.id,
        action: comment,
        actorUserId: input.context.actorUserId,
        idempotencyKey: `${input.idempotencyKey}:comment`,
      }),
    );
  }
  return created;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002';
}
