import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RoutingService } from '../routing/routing.service';
import { TicketApprovalsConfigurationLoader } from './approvals/ticket-approvals-configuration.loader';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { TicketCloseCodesConfigurationLoader } from './close-codes/ticket-close-codes-configuration.loader';
import type { TicketPersistedMessageSink } from './collaboration.types';
import { createTicket } from './create-ticket';
import { getTicket } from './get-ticket';
import { listTickets } from './list-tickets';
import { mapTicketError } from './map-ticket-error';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { TicketRedactionConfigurationLoader } from './redaction/ticket-redaction-configuration.loader';
import { scanTicketContent } from './redaction/assert-ticket-content-redaction';
import { TicketRequiredFieldsConfigurationLoader } from './required-fields/ticket-required-fields-configuration.loader';
import { TicketReopenConfigurationLoader } from './reopen/ticket-reopen-configuration.loader';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { toSingleTicketClientResponse, toTicketClientResponses } from './to-ticket-client-responses';
import { updateTicket } from './update-ticket';
import type {
  CreateTicketInput,
  ListTicketsQuery,
  TicketMutationContext,
  TicketRecord,
  TicketResponse,
  UpdateTicketInput,
} from './tickets.types';
import type { RedactionMatch } from './redaction/redaction.types';

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
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  create(
    input: CreateTicketInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.execute(async () => {
      const messages: TicketPersistedMessageSink = [];
      const redaction = await this.redactionConfigurationLoader.load();
      const created = await createTicket(
        this.prisma,
        this.routingService,
        this.authorizationContextLoader,
        this.approvalsConfigurationLoader,
        input,
        context,
        messages,
        redaction,
      );
      const assigned = await this.ticketAssignmentService.applyAfterCreate(
        created,
        context,
        messages,
      );
      publishPersistedTicketMessages(this.realtimeHub, assigned, messages);
      return this.respond(
        assigned,
        scanTicketContent({
          configuration: redaction,
          title: assigned.title,
          description: assigned.description,
        }).matches,
      );
    });
  }

  list(
    query: ListTicketsQuery,
    context: TicketMutationContext,
  ): Promise<readonly TicketResponse[]> {
    return this.execute(async () => {
      const records = await listTickets(
        this.prisma,
        this.authorizationContextLoader,
        query,
        context,
      );
      return this.respondAll(records);
    });
  }

  listInbox(
    context: TicketMutationContext,
  ): Promise<readonly TicketResponse[]> {
    return this.execute(async () =>
      this.respondAll(await this.ticketAssignmentService.listInbox(context)),
    );
  }

  getById(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.execute(async () =>
      this.respond(
        await getTicket(
          this.prisma,
          this.authorizationContextLoader,
          ticketId,
          context,
        ),
      ),
    );
  }

  claim(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.execute(async () => {
      const messages: TicketPersistedMessageSink = [];
      const claimed = await this.ticketAssignmentService.claim(
        ticketId,
        context,
        messages,
      );
      publishPersistedTicketMessages(this.realtimeHub, claimed, messages);
      return this.respond(claimed);
    });
  }

  update(
    ticketId: string,
    input: UpdateTicketInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.execute(async () => {
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
        context,
        messages,
        { closeCodes, requiredFields, redaction },
      );
      publishPersistedTicketMessages(this.realtimeHub, updated, messages);
      return this.respond(
        updated,
        scanTicketContent({
          configuration: redaction,
          title: input.title === undefined ? undefined : updated.title,
          description:
            input.description === undefined ? undefined : updated.description,
        }).matches,
      );
    });
  }

  private async respond(
    record: TicketRecord,
    redactionWarnings?: readonly RedactionMatch[],
  ): Promise<TicketResponse> {
    return toSingleTicketClientResponse(this.prisma, record, {
      reopen: await this.reopenConfigurationLoader.load(),
      closeCodes: await this.closeCodesConfigurationLoader.load(),
      redactionWarnings,
    });
  }

  private async respondAll(
    records: readonly TicketRecord[],
  ): Promise<readonly TicketResponse[]> {
    return toTicketClientResponses(this.prisma, records, {
      reopen: await this.reopenConfigurationLoader.load(),
      closeCodes: await this.closeCodesConfigurationLoader.load(),
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapTicketError(error);
    }
  }
}
