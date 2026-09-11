import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { RoutingService } from '../../routing/routing.service';
import type { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { createReopenedTicket } from './create-reopened-ticket';
import { reopenSameTicket } from './reopen-same-ticket';
import { resolveTicketReopenPolicy } from './resolve-ticket-reopen-policy';
import type { ReopenTicketInput, TicketReopenConfiguration } from './reopen.types';

export async function reopenTicket(input: {
  readonly prisma: PrismaService;
  readonly routingService: RoutingService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader;
  readonly configuration: TicketReopenConfiguration;
  readonly ticketId: string;
  readonly body: ReopenTicketInput;
  readonly context: TicketMutationContext;
  readonly now?: Date;
  readonly messages?: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const now = input.now ?? new Date();
  const messages = input.messages ?? [];
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
    now,
  });
  if (!policy.eligible) {
    throw new TicketsError('REOPEN_NOT_ELIGIBLE');
  }
  const shared = {
    prisma: input.prisma,
    authorizationContextLoader: input.authorizationContextLoader,
    configuration: input.configuration,
    ticketId: input.ticketId,
    body: input.body,
    context: input.context,
    now,
    messages,
  };
  if (policy.mode === 'new_ticket') {
    return createReopenedTicket({
      ...shared,
      routingService: input.routingService,
      approvalsConfigurationLoader: input.approvalsConfigurationLoader,
    });
  }
  return reopenSameTicket(shared);
}
