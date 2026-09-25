import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { TicketCloseCodesConfigurationLoader } from '../close-codes/ticket-close-codes-configuration.loader';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { overrideTicketPriority } from '../priority/override-ticket-priority';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketRedactionConfigurationLoader } from '../redaction/ticket-redaction-configuration.loader';
import { TicketReopenConfigurationLoader } from '../reopen/ticket-reopen-configuration.loader';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toSingleTicketClientResponse } from '../to-ticket-client-responses';
import type { TicketMutationContext, TicketRecord, TicketResponse } from '../tickets.types';
import type {
  MergeTicketDto,
  OverrideTicketPriorityDto,
  UnmergeTicketDto,
} from './dto/merge.dto';
import { listMergeCandidates, type MergeCandidate } from './list-merge-candidates';
import { listMergedTickets, type MergedTicketItem } from './list-merged-tickets';
import { mergeTicket } from './merge-ticket';
import { unmergeTicket } from './unmerge-ticket';

/** Package 1.2 — manual priority, single merge and unmerge. */
@Injectable()
export class TicketsMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly redactionLoader: TicketRedactionConfigurationLoader,
    private readonly reopenLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesLoader: TicketCloseCodesConfigurationLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  overridePriority(
    ticketId: string,
    body: OverrideTicketPriorityDto,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.mutate(context, async (gated, messages) =>
      overrideTicketPriority({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        redaction: await this.redactionLoader.load(),
        ticketId,
        body,
        context: gated,
        messages,
      }),
    );
  }

  merge(
    ticketId: string,
    body: MergeTicketDto,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.mutate(context, async (gated, messages) => {
      const { child } = await mergeTicket({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        redaction: await this.redactionLoader.load(),
        ticketId,
        parentTicketId: body.parentTicketId,
        reason: body.reason,
        context: gated,
        messages,
      });
      return child;
    });
  }

  unmerge(
    ticketId: string,
    body: UnmergeTicketDto,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return this.mutate(context, async (gated, messages) =>
      unmergeTicket({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        redaction: await this.redactionLoader.load(),
        ticketId,
        reason: body.reason,
        context: gated,
        messages,
      }),
    );
  }

  listMerged(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<readonly MergedTicketItem[]> {
    return executeTicketOperation(async () =>
      listMergedTickets({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        ticketId,
        context: await this.accessPolicies.bind(context),
      }),
    );
  }

  listCandidates(
    ticketId: string,
    query: string | undefined,
    context: TicketMutationContext,
  ): Promise<readonly MergeCandidate[]> {
    return executeTicketOperation(async () =>
      listMergeCandidates({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        ticketId,
        query,
        context: await this.accessPolicies.bind(context),
      }),
    );
  }

  private mutate(
    context: TicketMutationContext,
    run: (
      gated: TicketMutationContext,
      messages: TicketPersistedMessageSink,
    ) => Promise<TicketRecord>,
  ): Promise<TicketResponse> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      const messages: TicketPersistedMessageSink = [];
      const ticket = await run(gated, messages);
      publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
      const [reopen, closeCodes] = await Promise.all([
        this.reopenLoader.load(),
        this.closeCodesLoader.load(),
      ]);
      return toSingleTicketClientResponse(this.prisma, ticket, {
        reopen,
        closeCodes,
        actorUserId: gated.actorUserId,
      });
    });
  }
}
