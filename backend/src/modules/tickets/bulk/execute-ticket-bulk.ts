import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { applyBulkAssign } from './apply-bulk-assign';
import { applyBulkBroadcast } from './apply-bulk-broadcast';
import { applyBulkMerge } from './apply-bulk-merge';
import { applyBulkPriority } from './apply-bulk-priority';
import { applyBulkStatus } from './apply-bulk-status';
import { assertBulkActionAllowed } from './assert-bulk-action-allowed';
import { assertBulkTicketScope } from './assert-bulk-ticket-scope';
import type {
  BulkForwardingDependencies,
  ExecuteTicketBulkInput,
  TicketBulkConfiguration,
} from './bulk.types';

export async function executeTicketBulk(input: {
  readonly prisma: PrismaService;
  readonly context: AuthorizationContext;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly configuration: TicketBulkConfiguration;
  readonly messages: TicketPersistedMessageSink;
  readonly forwarding: BulkForwardingDependencies;
}): Promise<{
  readonly batchId: string | null;
  readonly tickets: readonly TicketRecord[];
  readonly recipientCount?: number;
}> {
  assertBulkActionAllowed({
    context: input.context,
    configuration: input.configuration,
    body: input.body,
  });
  assertBulkTicketScope({
    context: input.context,
    configuration: input.configuration,
    tickets: input.tickets,
  });
  const batchId = input.configuration.auditBatchIdEnabled
    ? randomUUID()
    : null;
  const tickets = await dispatchBulkAction({ ...input, batchId });
  await recordAuditEntry(input.prisma, {
    action: auditLogActions.ticketBulkExecute,
    entityType: auditLogEntityTypes.ticketBulk,
    entityId: batchId ?? tickets.tickets[0]?.id ?? 'ticket_bulk',
    metadata: {
      actionType: input.body.actionType,
      ticketIds: input.body.ticketIds,
      batchId,
    },
    actorUserId: input.actor.actorUserId,
    organizationalUnitId: resolveBulkOrganizationalUnitId(input.tickets),
  });
  return tickets;
}

async function dispatchBulkAction(input: {
  readonly prisma: PrismaService;
  readonly context: AuthorizationContext;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly configuration: TicketBulkConfiguration;
  readonly messages: TicketPersistedMessageSink;
  readonly forwarding: BulkForwardingDependencies;
  readonly batchId: string | null;
}): Promise<{
  readonly batchId: string | null;
  readonly tickets: readonly TicketRecord[];
  readonly recipientCount?: number;
}> {
  const shared = {
    prisma: input.prisma,
    actor: input.actor,
    tickets: input.tickets,
    body: input.body,
    batchId: input.batchId,
    messages: input.messages,
  };
  if (
    input.body.actionType === 'assign_group' ||
    input.body.actionType === 'assign_user'
  ) {
    return {
      batchId: input.batchId,
      tickets: await applyBulkAssign({
        ...shared,
        context: input.context,
        forwarding: input.forwarding,
      }),
    };
  }
  if (input.body.actionType === 'set_status') {
    return {
      batchId: input.batchId,
      tickets: await applyBulkStatus({ ...shared, context: input.context }),
    };
  }
  if (input.body.actionType === 'set_priority') {
    return { batchId: input.batchId, tickets: await applyBulkPriority(shared) };
  }
  if (input.body.actionType === 'broadcast_message') {
    const broadcast = await applyBulkBroadcast({
      ...shared,
      configuration: input.configuration,
    });
    return {
      batchId: input.batchId,
      tickets: broadcast.tickets,
      recipientCount: broadcast.recipientCount,
    };
  }
  if (input.body.actionType === 'merge_into_parent') {
    return { batchId: input.batchId, tickets: await applyBulkMerge(shared) };
  }
  throw new TicketsError('BULK_ACTION_NOT_ALLOWED');
}

function resolveBulkOrganizationalUnitId(
  tickets: readonly TicketRecord[],
): string | null {
  const identifiers = [...new Set(tickets.map((ticket) => ticket.originUnitId))];
  return identifiers.length === 1 ? (identifiers[0] ?? null) : null;
}
