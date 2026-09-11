import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RoutingService } from '../routing/routing.service';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import type { TicketPersistedMessageSink } from './collaboration.types';
import { createTicket } from './create-ticket';
import { getTicket } from './get-ticket';
import { listTickets } from './list-tickets';
import { mapTicketError } from './map-ticket-error';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { toTicketResponse } from './to-ticket-response';
import { updateTicket } from './update-ticket';
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
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  create(
    input: CreateTicketInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.execute(async () => {
      const messages: TicketPersistedMessageSink = [];
      const created = await createTicket(
        this.prisma,
        this.routingService,
        this.authorizationContextLoader,
        input,
        context,
        messages,
      );
      const assigned = await this.ticketAssignmentService.applyAfterCreate(
        created,
        context,
        messages,
      );
      publishPersistedTicketMessages(this.realtimeHub, assigned, messages);
      return toTicketResponse(assigned);
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
      return records.map(toTicketResponse);
    });
  }

  listInbox(
    context: TicketMutationContext,
  ): Promise<readonly TicketResponse[]> {
    return this.execute(async () => {
      const records = await this.ticketAssignmentService.listInbox(context);
      return records.map(toTicketResponse);
    });
  }

  getById(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.execute(async () =>
      toTicketResponse(
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
      return toTicketResponse(claimed);
    });
  }

  update(
    ticketId: string,
    input: UpdateTicketInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.execute(async () =>
      toTicketResponse(
        await updateTicket(
          this.prisma,
          this.authorizationContextLoader,
          ticketId,
          input,
          context,
        ),
      ),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapTicketError(error);
    }
  }
}
