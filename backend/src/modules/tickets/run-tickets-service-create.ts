import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RoutingService } from '../routing/routing.service';
import type { TicketApprovalsConfigurationLoader } from './approvals/ticket-approvals-configuration.loader';
import type { TicketAssignmentService } from './assignment/ticket-assignment.service';
import type { TicketPersistedMessageSink } from './collaboration.types';
import { createTicket } from './create-ticket';
import type { DuplicateTicketMatch } from './guardrails/guardrails.types';
import type { TicketGuardrailsConfigurationLoader } from './guardrails/ticket-guardrails-configuration.loader';
import { scanTicketContent } from './redaction/assert-ticket-content-redaction';
import type { TicketRedactionConfigurationLoader } from './redaction/ticket-redaction-configuration.loader';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import type { TicketRealtimeHub } from './ticket-realtime.hub';
import { respondLoadedTicket } from './to-ticket-client-responses';
import type {
  CreateTicketInput,
  TicketMutationContext,
  TicketResponse,
} from './tickets.types';
import type { TicketCloseCodesConfigurationLoader } from './close-codes/ticket-close-codes-configuration.loader';
import type { TicketReopenConfigurationLoader } from './reopen/ticket-reopen-configuration.loader';

export async function runTicketsServiceCreate(input: {
  readonly prisma: PrismaService;
  readonly routingService: RoutingService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader;
  readonly assignmentService: TicketAssignmentService;
  readonly redactionLoader: TicketRedactionConfigurationLoader;
  readonly guardrailsLoader: TicketGuardrailsConfigurationLoader;
  readonly reopenLoader: TicketReopenConfigurationLoader;
  readonly closeCodesLoader: TicketCloseCodesConfigurationLoader;
  readonly realtimeHub: TicketRealtimeHub;
  readonly body: CreateTicketInput;
  readonly context: TicketMutationContext;
}): Promise<TicketResponse> {
  const messages: TicketPersistedMessageSink = [];
  const duplicateWarnings: DuplicateTicketMatch[] = [];
  const [redaction, guardrails] = await Promise.all([
    input.redactionLoader.load(),
    input.guardrailsLoader.load(),
  ]);
  const created = await createTicket(
    input.prisma,
    input.routingService,
    input.authorizationContextLoader,
    input.approvalsConfigurationLoader,
    input.body,
    input.context,
    messages,
    redaction,
    guardrails,
    duplicateWarnings,
  );
  const assigned = await input.assignmentService.applyAfterCreate(
    created,
    input.context,
    messages,
  );
  publishPersistedTicketMessages(input.realtimeHub, assigned, messages);
  return respondLoadedTicket(
    input.prisma,
    assigned,
    { reopen: input.reopenLoader, closeCodes: input.closeCodesLoader },
    scanTicketContent({
      configuration: redaction,
      title: assigned.title,
      description: assigned.description,
    }).matches,
    duplicateWarnings,
  );
}
