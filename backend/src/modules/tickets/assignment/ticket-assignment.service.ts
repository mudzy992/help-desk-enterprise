import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { applyTicketAutoAssignment } from './apply-ticket-auto-assignment';
import { claimTicket } from './claim-ticket';
import { listGroupInboxTickets } from './list-group-inbox-tickets';
import {
  readGroupInboxStatus,
  type GroupInboxStatus,
} from './read-group-inbox-status';
import { TicketAssignmentConfigurationLoader } from './ticket-assignment-configuration.loader';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';

@Injectable()
export class TicketAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TicketAssignmentConfigurationLoader,
  ) {}

  applyAfterCreate(
    ticket: TicketRecord,
    context: TicketMutationContext,
    messages: TicketPersistedMessageSink = [],
  ): Promise<TicketRecord> {
    return applyTicketAutoAssignment(
      this.prisma,
      this.authorizationContextLoader,
      this.configurationLoader,
      ticket,
      context.actorUserId,
      messages,
    );
  }

  listInbox(
    context: TicketMutationContext,
  ): Promise<readonly TicketRecord[]> {
    return listGroupInboxTickets(
      this.prisma,
      this.authorizationContextLoader,
      this.configurationLoader,
      context,
    );
  }

  async isGroupInboxEnabled(): Promise<boolean> {
    return (await this.configurationLoader.load()).groupInboxEnabled;
  }

  readInboxStatus(context: TicketMutationContext): Promise<GroupInboxStatus> {
    return readGroupInboxStatus(
      this.prisma,
      this.authorizationContextLoader,
      this.configurationLoader,
      context,
    );
  }

  claim(
    ticketId: string,
    context: TicketMutationContext,
    messages: TicketPersistedMessageSink = [],
  ): Promise<TicketRecord> {
    return claimTicket(
      this.prisma,
      this.authorizationContextLoader,
      this.configurationLoader,
      ticketId,
      context,
      messages,
    );
  }
}
