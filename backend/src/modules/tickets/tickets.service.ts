import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RoutingService } from '../routing/routing.service';
import { TicketApprovalsConfigurationLoader } from './approvals/ticket-approvals-configuration.loader';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { TicketArchiveConfigurationLoader } from './archive/ticket-archive-configuration.loader';
import { TicketCsatConfigurationLoader } from './csat/ticket-csat-configuration.loader';
import { TicketSlaTimersService } from '../sla/ticket-sla-timers.service';
import { TicketCloseCodesConfigurationLoader } from './close-codes/ticket-close-codes-configuration.loader';
import { TicketConfidentialConfigurationLoader } from './confidential/ticket-confidential-configuration.loader';
import type { TicketPersistedMessageSink } from './collaboration.types';
import { executeTicketOperation } from './execute-ticket-operation';
import { getTicket } from './get-ticket';
import { listTickets } from './list-tickets';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { TicketGuardrailsConfigurationLoader } from './guardrails/ticket-guardrails-configuration.loader';
import { TicketRedactionConfigurationLoader } from './redaction/ticket-redaction-configuration.loader';
import { scanTicketContent } from './redaction/assert-ticket-content-redaction';
import { TicketRequiredFieldsConfigurationLoader } from './required-fields/ticket-required-fields-configuration.loader';
import { TicketReopenConfigurationLoader } from './reopen/ticket-reopen-configuration.loader';
import { TicketSafeLoggingConfigurationLoader } from './safe-logging/ticket-safe-logging-configuration.loader';
import { runTicketsServiceCreate } from './run-tickets-service-create';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import {
  respondLoadedTicket,
  respondLoadedTickets,
} from './to-ticket-client-responses';
import { updateTicket } from './update-ticket';
import { withTicketAccessPolicies } from './with-ticket-access-policies';
import type {
  CreateTicketInput,
  ListTicketsQuery,
  TicketMutationContext,
  TicketResponse,
  UpdateTicketInput,
} from './tickets.types';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly ticketAssignmentService: TicketAssignmentService,
    private readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader,
    private readonly reopenConfigurationLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesConfigurationLoader: TicketCloseCodesConfigurationLoader,
    private readonly requiredFieldsConfigurationLoader: TicketRequiredFieldsConfigurationLoader,
    private readonly redactionConfigurationLoader: TicketRedactionConfigurationLoader,
    private readonly guardrailsConfigurationLoader: TicketGuardrailsConfigurationLoader,
    private readonly confidentialLoader: TicketConfidentialConfigurationLoader,
    private readonly safeLoggingLoader: TicketSafeLoggingConfigurationLoader,
    private readonly archiveLoader: TicketArchiveConfigurationLoader,
    private readonly csatLoader: TicketCsatConfigurationLoader,
    private readonly slaTimers: TicketSlaTimersService,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  create(input: CreateTicketInput, context: TicketMutationContext) {
    return executeTicketOperation(async () =>
      runTicketsServiceCreate({
        prisma: this.prisma,
        routingService: this.routingService,
        authorizationContextLoader: this.authorizationContextLoader,
        approvalsConfigurationLoader: this.approvalsConfigurationLoader,
        assignmentService: this.ticketAssignmentService,
        redactionLoader: this.redactionConfigurationLoader,
        guardrailsLoader: this.guardrailsConfigurationLoader,
        reopenLoader: this.reopenConfigurationLoader,
        closeCodesLoader: this.closeCodesConfigurationLoader,
        realtimeHub: this.realtimeHub,
        body: input,
        context: await this.gate(context),
      }),
    );
  }

  list(query: ListTicketsQuery, context: TicketMutationContext) {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      return respondLoadedTickets(
        this.prisma,
        await listTickets(
          this.prisma,
          this.authorizationContextLoader,
          query,
          gated,
          gated.archive,
        ),
        this.clientLoaders(gated.actorUserId),
      );
    });
  }

  listInbox(context: TicketMutationContext): Promise<readonly TicketResponse[]> {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      return respondLoadedTickets(
        this.prisma,
        await this.ticketAssignmentService.listInbox(gated),
        this.clientLoaders(gated.actorUserId),
      );
    });
  }

  getById(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      return respondLoadedTicket(
        this.prisma,
        await getTicket(
          this.prisma,
          this.authorizationContextLoader,
          ticketId,
          gated,
          { auditView: true },
        ),
        this.clientLoaders(gated.actorUserId),
      );
    });
  }

  claim(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(async () => {
      const messages: TicketPersistedMessageSink = [];
      const gated = await this.gate(context);
      const claimed = await this.ticketAssignmentService.claim(
        ticketId,
        gated,
        messages,
      );
      publishPersistedTicketMessages(this.realtimeHub, claimed, messages);
      return respondLoadedTicket(
        this.prisma,
        claimed,
        this.clientLoaders(gated.actorUserId),
      );
    });
  }

  update(
    ticketId: string,
    input: UpdateTicketInput,
    context: TicketMutationContext,
  ) {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      const messages: TicketPersistedMessageSink = [];
      const [closeCodes, requiredFields, redaction] = await Promise.all([
        this.closeCodesConfigurationLoader.load(),
        this.requiredFieldsConfigurationLoader.load(),
        this.redactionConfigurationLoader.load(),
      ]);
      const updated = await updateTicket(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        input,
        gated,
        messages,
        { closeCodes, requiredFields, redaction },
      );
      publishPersistedTicketMessages(this.realtimeHub, updated, messages);
      return respondLoadedTicket(
        this.prisma,
        updated,
        this.clientLoaders(gated.actorUserId),
        scanTicketContent({
          configuration: redaction,
          title: input.title === undefined ? undefined : updated.title,
          description:
            input.description === undefined ? undefined : updated.description,
        }).matches,
      );
    });
  }

  private gate(context: TicketMutationContext) {
    return withTicketAccessPolicies(context, {
      confidential: this.confidentialLoader,
      safeLogging: this.safeLoggingLoader,
      archive: this.archiveLoader,
    }).then((gated) => ({ ...gated, slaTimers: this.slaTimers }));
  }

  private clientLoaders(actorUserId: string) {
    return {
      reopen: this.reopenConfigurationLoader,
      closeCodes: this.closeCodesConfigurationLoader,
      csat: this.csatLoader,
      actorUserId,
    };
  }
}
