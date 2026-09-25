import { Injectable } from '@nestjs/common';
import { TicketForwardingConfigurationLoader } from '../forwarding/ticket-forwarding-configuration.loader';
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
import { TicketGuardrailsConfigurationLoader } from '../guardrails/ticket-guardrails-configuration.loader';
import {
  assertBulkBroadcastConfirmation,
  requiresBulkBroadcastConfirmation,
} from '../guardrails/assert-bulk-broadcast-confirmation';

@Injectable()
export class TicketsBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly bulkConfigurationLoader: TicketBulkConfigurationLoader,
    private readonly guardrailsConfigurationLoader: TicketGuardrailsConfigurationLoader,
    private readonly reopenConfigurationLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesConfigurationLoader: TicketCloseCodesConfigurationLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
    private readonly forwardingConfigurationLoader: TicketForwardingConfigurationLoader,
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
      const guardrails = await this.guardrailsConfigurationLoader.load();
      const recipientCount = countBroadcastRecipients(tickets);
      const requiresBroadcastConfirmation = requiresBulkBroadcastConfirmation({
        configuration: guardrails,
        recipientCount,
      });
      return {
        ticketCount: tickets.length,
        recipientCount,
        emailRequested: configuration.broadcastEnableEmail,
        requiresConfirmation:
          configuration.broadcastRequirePreview || requiresBroadcastConfirmation,
        requiresBroadcastConfirmation,
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
      if (body.actionType === 'broadcast_message') {
        assertBulkBroadcastConfirmation({
          configuration: await this.guardrailsConfigurationLoader.load(),
          recipientCount: countBroadcastRecipients(tickets),
          broadcastConfirmed: body.broadcastConfirmed,
        });
      }
      const result = await executeTicketBulk({
        prisma: this.prisma,
        context: authContext,
        actor: gated,
        tickets,
        body,
        configuration,
        messages,
        forwarding: {
          authorizationContextLoader: this.authorizationContextLoader,
          configuration:
            body.actionType === 'assign_group'
              ? await this.forwardingConfigurationLoader.load()
              : null,
        },
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
