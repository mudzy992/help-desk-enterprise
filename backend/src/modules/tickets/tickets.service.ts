import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RoutingService } from '../routing/routing.service';
import { TicketApprovalsConfigurationLoader } from './approvals/ticket-approvals-configuration.loader';
import { TicketAssignmentConfigurationLoader } from './assignment/ticket-assignment-configuration.loader';
import { previewTicketRouting } from './routing-preview/preview-ticket-routing';
import type { TicketRoutingPreview } from './routing-preview/routing-preview.types';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import type { GroupInboxStatus } from './assignment/read-group-inbox-status';
import { TicketArchiveConfigurationLoader } from './archive/ticket-archive-configuration.loader';
import { TicketCsatConfigurationLoader } from './csat/ticket-csat-configuration.loader';
import { TicketSlaTimersService } from '../sla/ticket-sla-timers.service';
import { TicketCloseCodesConfigurationLoader } from './close-codes/ticket-close-codes-configuration.loader';
import { TicketConfidentialConfigurationLoader } from './confidential/ticket-confidential-configuration.loader';
import type { TicketPersistedMessageSink } from './collaboration.types';
import { executeTicketOperation } from './execute-ticket-operation';
import { getTicket } from './get-ticket';
import { getTicketCounts } from './counts/get-ticket-counts';
import type { TicketCounts, TicketCountsQuery } from './counts/counts.types';
import { listTicketsPage, listTicketsWithin } from './list-tickets';
import { respondTicketListPage } from './list/respond-ticket-list-page';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { TicketGuardrailsConfigurationLoader } from './guardrails/ticket-guardrails-configuration.loader';
import { TicketRedactionConfigurationLoader } from './redaction/ticket-redaction-configuration.loader';
import { scanTicketContent } from './redaction/assert-ticket-content-redaction';
import { TicketRequiredFieldsConfigurationLoader } from './required-fields/ticket-required-fields-configuration.loader';
import { TicketReopenConfigurationLoader } from './reopen/ticket-reopen-configuration.loader';
import { TicketSafeLoggingConfigurationLoader } from './safe-logging/ticket-safe-logging-configuration.loader';
import { runTicketsServiceCreate } from './run-tickets-service-create';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { TicketLabelCacheService } from './labels/ticket-label-cache.service';
import { respondLoadedTicket } from './to-ticket-client-responses';
import { updateTicket } from './update-ticket';
import { withTicketAccessPolicies } from './with-ticket-access-policies';
import type {
  CreateTicketInput,
  ListTicketsQuery,
  TicketListResponse,
  TicketMutationContext,
  TicketResponse,
  TicketSearchMatch,
  UpdateTicketInput,
} from './tickets.types';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly ticketAssignmentService: TicketAssignmentService,
    private readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader,
    private readonly reopenConfigurationLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesConfigurationLoader: TicketCloseCodesConfigurationLoader,
    private readonly requiredFieldsConfigurationLoader: TicketRequiredFieldsConfigurationLoader,
    private readonly redactionConfigurationLoader: TicketRedactionConfigurationLoader,
    private readonly guardrailsConfigurationLoader: TicketGuardrailsConfigurationLoader,
    private readonly confidentialLoader: TicketConfidentialConfigurationLoader,
    private readonly safeLoggingLoader: TicketSafeLoggingConfigurationLoader,
    private readonly archiveLoader: TicketArchiveConfigurationLoader,
    private readonly csatLoader: TicketCsatConfigurationLoader,
    private readonly slaTimers: TicketSlaTimersService,
    private readonly realtimeHub: TicketRealtimeHub,
    private readonly assignmentConfigurationLoader: TicketAssignmentConfigurationLoader,
    private readonly ticketLabelCache: TicketLabelCacheService,
  ) {}

  previewRouting(
    input: { readonly originUnitId?: string; readonly serviceId: string },
    context: TicketMutationContext,
  ): Promise<TicketRoutingPreview> {
    return executeTicketOperation(() =>
      previewTicketRouting(
        this.prisma,
        this.routingService,
        this.authorizationContextLoader,
        this.approvalsConfigurationLoader,
        this.assignmentConfigurationLoader,
        input,
        context,
      ),
    );
  }

  create(input: CreateTicketInput, context: TicketMutationContext) {
    return executeTicketOperation(async () =>
      runTicketsServiceCreate({
        prisma: this.prisma,
        routingService: this.routingService,
        authorizationContextLoader: this.authorizationContextLoader,
        approvalsConfigurationLoader: this.approvalsConfigurationLoader,
        assignmentService: this.ticketAssignmentService,
        redactionLoader: this.redactionConfigurationLoader,
        guardrailsLoader: this.guardrailsConfigurationLoader,
        reopenLoader: this.reopenConfigurationLoader,
        closeCodesLoader: this.closeCodesConfigurationLoader,
        realtimeHub: this.realtimeHub,
        body: input,
        context: await this.gate(context),
      }),
    );
  }

  /**
   * First page of the visible tickets as a plain array.
   *
   * Phase 1.1 (plan §1.1) retired the unpaged read: this helper is bounded by
   * the list page size (25 by default, 50 at most) and exists for the
   * server-side callers that only need a small, predictable slice. `GET
   * /tickets` itself always answers with a page envelope.
   */
  list(
    query: ListTicketsQuery,
    context: TicketMutationContext,
  ): Promise<readonly TicketResponse[]> {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      const page = await listTicketsPage(
        this.prisma,
        this.authorizationContextLoader,
        query,
        gated,
        gated.archive,
      );
      const response = await respondTicketListPage(
        this.prisma,
        page,
        this.clientLoaders(gated.actorUserId),
      );
      return response.items;
    });
  }

  /** One page of `GET /tickets`: `{ items, total, page, pageSize }`. */
  listPage(
    query: ListTicketsQuery,
    context: TicketMutationContext,
  ): Promise<TicketListResponse> {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      const page = await listTicketsPage(
        this.prisma,
        this.authorizationContextLoader,
        query,
        gated,
        gated.archive,
      );
      return respondTicketListPage(
        this.prisma,
        page,
        this.clientLoaders(gated.actorUserId),
      );
    });
  }

  /**
   * Ticket hits of `GET /search` (plan §1.2): the same query, visibility and
   * archive policy as the list, narrowed to number/title, capped by `limit`.
   * No new visibility rule is introduced here — this is the list query with a
   * `select` of three columns.
   */
  searchTickets(
    query: { readonly q: string; readonly limit: number },
    context: TicketMutationContext,
  ): Promise<readonly TicketSearchMatch[]> {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      const records = await listTicketsWithin(
        this.prisma,
        this.authorizationContextLoader,
        { q: query.q },
        gated,
        gated.archive,
        query.limit,
        // Global search shows number + title only; skip description/formData.
        { id: true, ticketNumber: true, title: true },
      );
      return records.map((record) => ({
        id: record.id,
        ticketNumber: record.ticketNumber,
        title: record.title,
      }));
    });
  }

  getCounts(
    query: TicketCountsQuery,
    context: TicketMutationContext,
  ): Promise<TicketCounts> {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      return getTicketCounts({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        query,
        context: gated,
        archive: gated.archive,
        groupInboxEnabled: await this.ticketAssignmentService.isGroupInboxEnabled(),
      });
    });
  }

  listInbox(
    query: { readonly groupId?: string; readonly page?: number; readonly pageSize?: number },
    context: TicketMutationContext,
  ): Promise<TicketListResponse> {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      const inboxPage = await this.ticketAssignmentService.listInbox(
        gated,
        query,
      );
      return respondTicketListPage(
        this.prisma,
        inboxPage,
        this.clientLoaders(gated.actorUserId),
      );
    });
  }

  getInboxStatus(context: TicketMutationContext): Promise<GroupInboxStatus> {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      return this.ticketAssignmentService.readInboxStatus(gated);
    });
  }

  getById(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      return respondLoadedTicket(
        this.prisma,
        await getTicket(
          this.prisma,
          this.authorizationContextLoader,
          ticketId,
          gated,
          { auditView: true },
        ),
        this.clientLoaders(gated.actorUserId),
      );
    });
  }

  claim(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(async () => {
      const messages: TicketPersistedMessageSink = [];
      const gated = await this.gate(context);
      const claimed = await this.ticketAssignmentService.claim(
        ticketId,
        gated,
        messages,
      );
      publishPersistedTicketMessages(this.realtimeHub, claimed, messages);
      return respondLoadedTicket(
        this.prisma,
        claimed,
        this.clientLoaders(gated.actorUserId),
      );
    });
  }

  update(
    ticketId: string,
    input: UpdateTicketInput,
    context: TicketMutationContext,
  ) {
    return executeTicketOperation(async () => {
      const gated = await this.gate(context);
      const messages: TicketPersistedMessageSink = [];
      const [closeCodes, requiredFields, redaction] = await Promise.all([
        this.closeCodesConfigurationLoader.load(),
        this.requiredFieldsConfigurationLoader.load(),
        this.redactionConfigurationLoader.load(),
      ]);
      const updated = await updateTicket(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        input,
        gated,
        messages,
        { closeCodes, requiredFields, redaction },
      );
      publishPersistedTicketMessages(this.realtimeHub, updated, messages);
      return respondLoadedTicket(
        this.prisma,
        updated,
        this.clientLoaders(gated.actorUserId),
        scanTicketContent({
          configuration: redaction,
          title: input.title === undefined ? undefined : updated.title,
          description:
            input.description === undefined ? undefined : updated.description,
        }).matches,
      );
    });
  }

  private gate(context: TicketMutationContext) {
    return withTicketAccessPolicies(context, {
      confidential: this.confidentialLoader,
      safeLogging: this.safeLoggingLoader,
      archive: this.archiveLoader,
    }).then((gated) => ({ ...gated, slaTimers: this.slaTimers }));
  }

  private clientLoaders(actorUserId: string) {
    return {
      reopen: this.reopenConfigurationLoader,
      closeCodes: this.closeCodesConfigurationLoader,
      csat: this.csatLoader,
      actorUserId,
      // Plan §4.2: the five catalogue reads behind the display labels are the
      // largest block left in a list request; the cache answers for ids a
      // previous request in the last minute already resolved.
      labelCache: this.ticketLabelCache,
    };
  }
}
