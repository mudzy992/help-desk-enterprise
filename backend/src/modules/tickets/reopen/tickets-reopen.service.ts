import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { RoutingService } from '../../routing/routing.service';
import { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { TicketAssignmentService } from '../assignment/ticket-assignment.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toTicketClientResponse } from '../to-ticket-response';
import type { TicketMutationContext, TicketResponse } from '../tickets.types';
import { reopenTicket } from './reopen-ticket';
import type { ReopenTicketInput } from './reopen.types';
import { TicketReopenConfigurationLoader } from './ticket-reopen-configuration.loader';

@Injectable()
export class TicketsReopenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader,
    private readonly reopenConfigurationLoader: TicketReopenConfigurationLoader,
    private readonly ticketAssignmentService: TicketAssignmentService,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  reopen(
    ticketId: string,
    input: ReopenTicketInput,
    context: TicketMutationContext,
    now = new Date(),
  ): Promise<TicketResponse> {
    return executeTicketOperation(async () => {
      const configuration = await this.reopenConfigurationLoader.load();
      const messages: TicketPersistedMessageSink = [];
      const record = await reopenTicket({
        prisma: this.prisma,
        routingService: this.routingService,
        authorizationContextLoader: this.authorizationContextLoader,
        approvalsConfigurationLoader: this.approvalsConfigurationLoader,
        configuration,
        ticketId,
        body: input,
        context,
        now,
        messages,
      });
      const assigned =
        record.reopenedFromTicketId === null
          ? record
          : await this.ticketAssignmentService.applyAfterCreate(
              record,
              context,
              messages,
            );
      publishPersistedTicketMessages(this.realtimeHub, assigned, messages);
      return toTicketClientResponse(assigned, configuration, now);
    });
  }
}
