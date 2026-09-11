import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RoutingService } from '../routing/routing.service';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { createTicket } from './create-ticket';
import { getTicket } from './get-ticket';
import { listTickets } from './list-tickets';
import { mapTicketError } from './map-ticket-error';
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
  ) {}

  create(
    input: CreateTicketInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.execute(async () => {
      const created = await createTicket(
        this.prisma,
        this.routingService,
        this.authorizationContextLoader,
        input,
        context,
      );
      return toTicketResponse(
        await this.ticketAssignmentService.applyAfterCreate(created, context),
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
    return this.execute(async () =>
      toTicketResponse(
        await this.ticketAssignmentService.claim(ticketId, context),
      ),
    );
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
