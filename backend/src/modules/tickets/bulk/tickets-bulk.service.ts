import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { permissionKeys } from '../../authorization/authorization.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketReopenConfigurationLoader } from '../reopen/ticket-reopen-configuration.loader';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toTicketClientResponses } from '../to-ticket-client-responses';
import { TicketCloseCodesConfigurationLoader } from '../close-codes/ticket-close-codes-configuration.loader';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { assertBulkTicketScope } from './assert-bulk-ticket-scope';
import { countBroadcastRecipients } from './apply-bulk-broadcast';
import type {
  ExecuteTicketBulkInput,
  TicketBulkPreview,
  TicketBulkResult,
} from './bulk.types';
import { executeTicketBulk } from './execute-ticket-bulk';
import { loadBulkTickets } from './load-bulk-tickets';
import { TicketBulkConfigurationLoader } from './ticket-bulk-configuration.loader';

@Injectable()
export class TicketsBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly bulkConfigurationLoader: TicketBulkConfigurationLoader,
    private readonly reopenConfigurationLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesConfigurationLoader: TicketCloseCodesConfigurationLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  preview(
    ticketIds: readonly string[],
    context: TicketMutationContext,
  ): Promise<TicketBulkPreview> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      const configuration = await this.bulkConfigurationLoader.load();
      if (!configuration.enabled) {
        throw new TicketsError('BULK_DISABLED');
      }
      const authContext =
        await this.authorizationContextLoader.loadBySubjectId(
          gated.actorUserId,
        );
      if (authContext === null) {
        throw new TicketsError('FORBIDDEN');
      }
      if (
        !authContext.isSuperAdmin &&
        !authContext.assignments.some((assignment) =>
          assignment.permissionKeys.includes(permissionKeys.ticketBulkBroadcast),
        )
      ) {
        throw new TicketsError('FORBIDDEN');
      }
      const tickets = await loadBulkTickets(
        this.prisma,
        this.authorizationContextLoader,
        ticketIds,
        gated,
      );
      assertBulkTicketScope({
        context: authContext,
        configuration,
        tickets,
      });
      return {
        ticketCount: tickets.length,
        recipientCount: countBroadcastRecipients(tickets),
        emailRequested: configuration.broadcastEnableEmail,
        requiresConfirmation: configuration.broadcastRequirePreview,
      };
    });
  }

  execute(
    body: ExecuteTicketBulkInput,
    context: TicketMutationContext,
  ): Promise<TicketBulkResult> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      const configuration = await this.bulkConfigurationLoader.load();
      const authContext =
        await this.authorizationContextLoader.loadBySubjectId(
          gated.actorUserId,
        );
      if (authContext === null) {
        throw new TicketsError('FORBIDDEN');
      }
      const messages: TicketPersistedMessageSink = [];
      const tickets = await loadBulkTickets(
        this.prisma,
        this.authorizationContextLoader,
        body.ticketIds,
        gated,
      );
      const result = await executeTicketBulk({
        prisma: this.prisma,
        context: authContext,
        actor: gated,
        tickets,
        body,
        configuration,
        messages,
      });
      const reopen = await this.reopenConfigurationLoader.load();
      const closeCodes = await this.closeCodesConfigurationLoader.load();
      for (const ticket of result.tickets) {
        publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
      }
      return {
        batchId: result.batchId,
        actionType: body.actionType,
        tickets: await toTicketClientResponses(this.prisma, result.tickets, {
          reopen,
          closeCodes,
        }),
        recipientCount: result.recipientCount,
      };
    });
  }
}
