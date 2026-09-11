import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { TicketAssignmentService } from '../assignment/ticket-assignment.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toTicketResponse } from '../to-ticket-response';
import type { TicketMutationContext, TicketResponse } from '../tickets.types';
import type {
  DecideTicketApprovalInput,
  TicketApprovalDecision,
  TicketApprovalResponse,
} from './approvals.types';
import { decideTicketApproval } from './decide-ticket-approval';
import { listTicketApprovals } from './list-ticket-approvals';
import { TicketApprovalsConfigurationLoader } from './ticket-approvals-configuration.loader';

@Injectable()
export class TicketsApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TicketApprovalsConfigurationLoader,
    private readonly ticketAssignmentService: TicketAssignmentService,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  list(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<readonly TicketApprovalResponse[]> {
    return executeTicketOperation(async () =>
      listTicketApprovals(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind(context),
        await this.configurationLoader.load(),
      ),
    );
  }

  approve(
    ticketId: string,
    approvalId: string,
    input: DecideTicketApprovalInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.decide(ticketId, approvalId, 'APPROVED', input, context);
  }

  reject(
    ticketId: string,
    approvalId: string,
    input: DecideTicketApprovalInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.decide(ticketId, approvalId, 'REJECTED', input, context);
  }

  private decide(
    ticketId: string,
    approvalId: string,
    decision: TicketApprovalDecision,
    input: DecideTicketApprovalInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      const messages: TicketPersistedMessageSink = [];
      const updated = await decideTicketApproval(
        this.prisma,
        this.authorizationContextLoader,
        await this.configurationLoader.load(),
        ticketId,
        approvalId,
        decision,
        input.comment,
        gated,
        messages,
      );
      const assigned =
        decision === 'APPROVED'
          ? await this.ticketAssignmentService.applyAfterCreate(
              updated,
              gated,
              messages,
            )
          : updated;
      publishPersistedTicketMessages(this.realtimeHub, assigned, messages);
      return toTicketResponse(assigned);
    });
  }
}
