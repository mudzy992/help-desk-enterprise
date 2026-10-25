import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TemplatesConfigurationLoader } from '../../templates/templates-configuration.loader';
import { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { TicketForwardingConfigurationLoader } from '../forwarding/ticket-forwarding-configuration.loader';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BulkCommandService } from '../../../common/bulk-command/bulk-command.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
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
  TicketBulkExecutionSummary,
  TicketBulkPreview,
  TicketBulkResult,
} from './bulk.types';
import { executeTicketBulk } from './execute-ticket-bulk';
import { claimBulkOperation, completeBulkOperation } from './ticket-bulk-operation';
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
    private readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader,
    @Optional()
    private readonly templatesLoader?: TemplatesConfigurationLoader,
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
      const operationId = body.operationId ?? randomUUID();
      const mode = body.mode ?? 'atomic';
      const command = { ...body, operationId, mode } as const;
      const common = {
        context: authContext,
        actor: gated,
        tickets,
        body: command,
        configuration,
        messages,
        forwarding: {
          authorizationContextLoader: this.authorizationContextLoader,
          configuration:
            body.actionType === 'assign_group'
              ? await this.forwardingConfigurationLoader.load()
              : null,
          approvals:
            body.actionType === 'assign_group'
              ? await this.approvalsConfigurationLoader.load()
              : null,
        },
        playbookMode:
          body.actionType === 'set_status' && this.templatesLoader !== undefined
            ? await this.templatesLoader.load().then((configuration) =>
                configuration.playbooksEnabled ? configuration.requiredStepsOnResolve : 'off',
              )
            : undefined,
      };
      if (body.operationId === undefined || body.mode === undefined) {
        const legacy = await executeTicketBulk({ ...common, prisma: this.prisma });
        const reopen = await this.reopenConfigurationLoader.load();
        const closeCodes = await this.closeCodesConfigurationLoader.load();
        for (const ticket of legacy.tickets) publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
        return {
          ...successSummary(operationId, mode, legacy.tickets.map((ticket) => ticket.id), legacy.recipientCount),
          batchId: legacy.batchId,
          actionType: body.actionType,
          tickets: await toTicketClientResponses(this.prisma, legacy.tickets, { reopen, closeCodes }),
          ...(legacy.recipientCount === undefined ? {} : { recipientCount: legacy.recipientCount }),
        };
      }
      const claim = await claimBulkOperation(this.prisma, command, gated.actorUserId);
      let result: Awaited<ReturnType<typeof executeTicketBulk>>;
      let summary: TicketBulkExecutionSummary;
      if (claim.replay !== null) {
        result = {
          batchId: operationId,
          tickets,
          ...(claim.replay.recipientCount === undefined ? {} : { recipientCount: claim.replay.recipientCount }),
        };
        summary = claim.replay;
      } else if (mode === 'atomic') {
        try {
          result = await this.prisma.$transaction(async (transaction) => {
          const executed = await executeTicketBulk({ ...common, prisma: transaction as never });
          const completed = {
            operationId, mode, outcome: 'SUCCEEDED' as const,
            ticketIds: executed.tickets.map((ticket) => ticket.id),
            succeeded: body.ticketIds.length, failed: 0, rolledBack: 0, skipped: 0,
            ...(executed.recipientCount === undefined ? {} : { recipientCount: executed.recipientCount }),
          };
          await transaction.ticketBulkOperationItem.updateMany({
            where: { operationId }, data: { status: 'SUCCEEDED', attempts: 1, completedAt: new Date() },
          });
          await completeBulkOperation(transaction as never, operationId, completed);
            return executed;
          });
          summary = successSummary(operationId, mode, body.ticketIds, result.recipientCount);
        } catch (error) {
          const failedSummary: TicketBulkExecutionSummary = {
            operationId, mode, outcome: 'FAILED', ticketIds: [],
            succeeded: 0, failed: 1, rolledBack: body.ticketIds.length, skipped: 0,
          };
          await this.prisma.$transaction(async (transaction) => {
            await transaction.ticketBulkOperationItem.updateMany({ where: { operationId },
              data: { status: 'ROLLED_BACK', attempts: 1, completedAt: new Date() } });
            await completeBulkOperation(transaction as never, operationId, failedSummary);
          });
          throw error;
        }
      } else {
        const parent = tickets.find((ticket) => ticket.id === body.parentTicketId);
        const bulk = new BulkCommandService(this.prisma);
        const execution = await bulk.execute({
          mode: 'best-effort',
          items: tickets.filter((ticket) => ticket.id !== body.parentTicketId).map((ticket) => ({ key: ticket.id, payload: ticket })),
          handle: async (item, transaction) => {
            const itemTickets = body.actionType === 'merge_into_parent' && parent !== undefined ? [parent, item.payload] : [item.payload];
            const executed = await executeTicketBulk({ ...common, prisma: transaction as never, tickets: itemTickets,
              body: { ...command, ticketIds: itemTickets.map((ticket) => ticket.id) }, writeAggregateAudit: false });
            await transaction.ticketBulkOperationItem.update({ where: { operationId_itemKey: { operationId, itemKey: item.key } },
              data: { status: 'SUCCEEDED', attempts: { increment: 1 }, completedAt: new Date(), result: { ticketIds: executed.tickets.map((ticket) => ticket.id) } } });
            return executed;
          },
        });
        for (const item of execution.results.filter((entry) => entry.status === 'FAILED')) {
          await this.prisma.ticketBulkOperationItem.update({ where: { operationId_itemKey: { operationId, itemKey: item.key } },
            data: { status: 'FAILED', attempts: { increment: 1 }, completedAt: new Date(), errorCode: item.error.code, retryable: item.error.retryable } });
        }
        const successful = execution.results.flatMap((entry) => entry.status === 'SUCCEEDED' ? entry.value.tickets : []);
        summary = { operationId, mode, outcome: execution.outcome, ticketIds: successful.map((ticket) => ticket.id),
          succeeded: execution.succeeded, failed: execution.failed, rolledBack: 0, skipped: 0 };
        await this.prisma.$transaction(async (transaction) => {
          await recordAuditEntry(transaction as never, { action: auditLogActions.ticketBulkExecute,
            entityType: auditLogEntityTypes.ticketBulk, entityId: operationId,
            metadata: { operationId, mode, outcome: execution.outcome, actionType: body.actionType,
              ticketIds: body.ticketIds, succeeded: execution.succeeded, failed: execution.failed },
            actorUserId: gated.actorUserId, organizationalUnitId: null });
          await completeBulkOperation(transaction as never, operationId, summary);
        });
        result = { batchId: operationId, tickets: successful };
      }
      const reopen = await this.reopenConfigurationLoader.load();
      const closeCodes = await this.closeCodesConfigurationLoader.load();
      for (const ticket of result.tickets) {
        publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
      }
      return {
        ...summary,
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

function successSummary(
  operationId: string,
  mode: 'atomic' | 'best-effort',
  ticketIds: readonly string[],
  recipientCount?: number,
): TicketBulkExecutionSummary {
  return {
    operationId, mode, outcome: 'SUCCEEDED', ticketIds,
    succeeded: ticketIds.length, failed: 0, rolledBack: 0, skipped: 0,
    ...(recipientCount === undefined ? {} : { recipientCount }),
  };
}
