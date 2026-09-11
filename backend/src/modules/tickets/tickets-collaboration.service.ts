import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { addTicketParticipant } from './add-ticket-participant';
import type {
  AddTicketParticipantInput,
  CreateTicketMessageInput,
  TicketActorAccess,
  TicketMessageResponse,
  TicketParticipantResponse,
} from './collaboration.types';
import { createTicketMessage } from './create-ticket-message';
import { executeTicketOperation } from './execute-ticket-operation';
import { listTicketMessages } from './list-ticket-messages';
import { listTicketParticipants } from './list-ticket-participants';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { publishForTicketId } from './publish-for-ticket-id';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { removeTicketParticipant } from './remove-ticket-participant';
import { TicketCollaborationConfigurationLoader } from './ticket-collaboration-configuration.loader';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { toTicketMessageResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';

@Injectable()
export class TicketsCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TicketCollaborationConfigurationLoader,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  listParticipants(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(() =>
      listTicketParticipants(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        context,
      ),
    );
  }

  addParticipant(
    ticketId: string,
    input: AddTicketParticipantInput,
    context: TicketMutationContext,
  ): Promise<TicketParticipantResponse> {
    return executeTicketOperation(async () => {
      const result = await addTicketParticipant(
        this.prisma,
        this.authorizationContextLoader,
        await this.configurationLoader.load(),
        ticketId,
        input,
        context,
      );
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        result.messages,
      );
      return result.participant;
    });
  }

  removeParticipant(
    ticketId: string,
    participantId: string,
    context: TicketMutationContext,
  ): Promise<void> {
    return executeTicketOperation(async () => {
      const messages = await removeTicketParticipant(
        this.prisma,
        this.authorizationContextLoader,
        await this.configurationLoader.load(),
        ticketId,
        participantId,
        context,
      );
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        messages,
      );
    });
  }

  listMessages(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(() =>
      listTicketMessages(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        context,
      ),
    );
  }

  createMessage(
    ticketId: string,
    input: CreateTicketMessageInput,
    context: TicketMutationContext,
  ): Promise<TicketMessageResponse> {
    return executeTicketOperation(async () => {
      const { ticket, message } = await createTicketMessage(
        this.prisma,
        this.authorizationContextLoader,
        await this.configurationLoader.load(),
        ticketId,
        input,
        context,
      );
      publishPersistedTicketMessages(this.realtimeHub, ticket, [message]);
      return toTicketMessageResponse(message);
    });
  }

  authorizeSocketJoin(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketActorAccess> {
    return executeTicketOperation(async () => {
      const loaded = await loadAccessibleTicket(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        context,
      );
      return loaded.access;
    });
  }
}
