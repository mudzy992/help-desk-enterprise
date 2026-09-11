import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { RoutingService } from '../../routing/routing.service';
import { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { TicketAssignmentService } from '../assignment/ticket-assignment.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketReopenConfigurationLoader } from '../reopen/ticket-reopen-configuration.loader';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toSingleTicketClientResponse } from '../to-ticket-client-responses';
import { TicketCloseCodesConfigurationLoader } from '../close-codes/ticket-close-codes-configuration.loader';
import type { TicketMutationContext } from '../tickets.types';
import { splitTicket } from './split-ticket';
import type { SplitTicketInput, SplitTicketResult } from './split.types';
import { TicketSplitConfigurationLoader } from './ticket-split-configuration.loader';

@Injectable()
export class TicketsSplitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader,
    private readonly splitConfigurationLoader: TicketSplitConfigurationLoader,
    private readonly reopenConfigurationLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesConfigurationLoader: TicketCloseCodesConfigurationLoader,
    private readonly ticketAssignmentService: TicketAssignmentService,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  split(
    ticketId: string,
    input: SplitTicketInput,
    context: TicketMutationContext,
  ): Promise<SplitTicketResult> {
    return executeTicketOperation(async () => {
      const configuration = await this.splitConfigurationLoader.load();
      const reopen = await this.reopenConfigurationLoader.load();
      const closeCodes = await this.closeCodesConfigurationLoader.load();
      const messages: TicketPersistedMessageSink = [];
      const result = await splitTicket({
        prisma: this.prisma,
        routingService: this.routingService,
        authorizationContextLoader: this.authorizationContextLoader,
        approvalsConfigurationLoader: this.approvalsConfigurationLoader,
        configuration,
        ticketId,
        body: input,
        context,
        messages,
      });
      const children = [];
      for (const child of result.children) {
        const assigned = await this.ticketAssignmentService.applyAfterCreate(
          child,
          context,
          messages,
        );
        publishPersistedTicketMessages(this.realtimeHub, assigned, messages);
        children.push(
          await toSingleTicketClientResponse(this.prisma, assigned, {
            reopen,
            closeCodes,
          }),
        );
      }
      publishPersistedTicketMessages(this.realtimeHub, result.parent, messages);
      return {
        parent: await toSingleTicketClientResponse(this.prisma, result.parent, {
          reopen,
          closeCodes,
        }),
        children,
      };
    });
  }
}
