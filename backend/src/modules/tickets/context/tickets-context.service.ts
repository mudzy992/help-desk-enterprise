import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { TicketAssignmentConfigurationLoader } from '../assignment/ticket-assignment-configuration.loader';
import { executeTicketOperation } from '../execute-ticket-operation';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import type { TicketMutationContext } from '../tickets.types';
import type {
  TicketAllowedActions,
  TicketCandidatesResponse,
  TicketHistoryEntry,
  TicketPeopleResponse,
  TicketPublicActivityEntry,
  TicketSlaContextResponse,
} from './context.types';
import { loadTicketCandidates } from './load-ticket-candidates';
import { loadTicketHistory } from './load-ticket-history';
import { loadTicketPeople } from './load-ticket-people';
import { loadTicketPublicActivity } from './load-ticket-public-activity';
import { loadTicketSlaContext } from './load-ticket-sla-context';
import { resolveTicketAllowedActions } from './resolve-ticket-allowed-actions';

@Injectable()
export class TicketsContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly assignmentConfigurationLoader: TicketAssignmentConfigurationLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
  ) {}

  people(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketPeopleResponse> {
    return this.run(context, (bound) =>
      loadTicketPeople(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        bound,
      ),
    );
  }

  candidates(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketCandidatesResponse> {
    return this.run(context, (bound) =>
      loadTicketCandidates(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        bound,
      ),
    );
  }

  history(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<readonly TicketHistoryEntry[]> {
    return this.run(context, (bound) =>
      loadTicketHistory(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        bound,
      ),
    );
  }

  publicActivity(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<readonly TicketPublicActivityEntry[]> {
    return this.run(context, (bound) =>
      loadTicketPublicActivity(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        bound,
      ),
    );
  }

  actions(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketAllowedActions> {
    return this.run(context, (bound) =>
      resolveTicketAllowedActions({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        assignmentConfigurationLoader: this.assignmentConfigurationLoader,
        ticketId,
        context: bound,
      }),
    );
  }

  slaContext(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketSlaContextResponse> {
    return this.run(context, (bound) =>
      loadTicketSlaContext(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        bound,
      ),
    );
  }

  private run<T>(
    context: TicketMutationContext,
    operation: (bound: TicketMutationContext) => Promise<T>,
  ): Promise<T> {
    return executeTicketOperation(async () =>
      operation(await this.accessPolicies.bind(context)),
    );
  }
}
