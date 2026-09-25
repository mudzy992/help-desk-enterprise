import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { TicketAssignmentService } from '../assignment/ticket-assignment.service';
import { TicketCloseCodesConfigurationLoader } from '../close-codes/ticket-close-codes-configuration.loader';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketRedactionConfigurationLoader } from '../redaction/ticket-redaction-configuration.loader';
import { TicketReopenConfigurationLoader } from '../reopen/ticket-reopen-configuration.loader';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toSingleTicketClientResponse } from '../to-ticket-client-responses';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { forwardTicket } from './forward-ticket';
import type {
  ForwardHistoryItem,
  ForwardTargetAgent,
  ForwardTargetsResponse,
  ForwardTicketInput,
} from './forwarding.types';
import { listForwardHistory } from './list-forward-history';
import { listForwardTargetAgents } from './list-forward-target-agents';
import { listForwardTargets } from './list-forward-targets';
import { publishPreviousGroupFeed } from './publish-previous-group-feed';
import { TicketForwardingConfigurationLoader } from './ticket-forwarding-configuration.loader';

@Injectable()
export class TicketsForwardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TicketForwardingConfigurationLoader,
    private readonly redactionLoader: TicketRedactionConfigurationLoader,
    private readonly reopenLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesLoader: TicketCloseCodesConfigurationLoader,
    private readonly ticketAssignmentService: TicketAssignmentService,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  forward(
    ticketId: string,
    input: ForwardTicketInput,
    context: TicketMutationContext,
  ) {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      const [configuration, redaction, reopen, closeCodes] = await Promise.all([
        this.configurationLoader.load(),
        this.redactionLoader.load(),
        this.reopenLoader.load(),
        this.closeCodesLoader.load(),
      ]);
      const before = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { assignedGroupId: true, assignedUserId: true },
      });
      const messages: TicketPersistedMessageSink = [];
      const forwarded = await forwardTicket({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        configuration,
        redaction,
        ticketId,
        body: input,
        context: gated,
        messages,
      });
      // The target group's own auto-assign strategy applies, as for a new ticket.
      const assigned: TicketRecord =
        await this.ticketAssignmentService.applyAfterCreate(
          forwarded,
          gated,
          messages,
        );
      publishPersistedTicketMessages(this.realtimeHub, assigned, messages);
      publishPreviousGroupFeed(this.realtimeHub, assigned, messages, before);
      return toSingleTicketClientResponse(this.prisma, assigned, {
        reopen,
        closeCodes,
        actorUserId: gated.actorUserId,
      });
    });
  }

  listTargets(
    ticketId: string,
    query: string | undefined,
    context: TicketMutationContext,
  ): Promise<ForwardTargetsResponse> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      return listForwardTargets({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        configuration: await this.configurationLoader.load(),
        ticketId,
        query,
        context: gated,
      });
    });
  }

  listTargetAgents(
    ticketId: string,
    groupId: string,
    context: TicketMutationContext,
  ): Promise<readonly ForwardTargetAgent[]> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      return listForwardTargetAgents({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        configuration: await this.configurationLoader.load(),
        ticketId,
        groupId,
        context: gated,
      });
    });
  }

  listHistory(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<readonly ForwardHistoryItem[]> {
    return executeTicketOperation(async () =>
      listForwardHistory({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        ticketId,
        context: await this.accessPolicies.bind(context),
      }),
    );
  }
}
