import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import {
  auditBulkTicketChange,
  ticketChangeLogReasons,
  ticketSystemEventActions,
} from './audit-bulk-ticket-change';
import { bulkBroadcastRateLimiter } from './bulk-broadcast-rate-limiter';
import type { ExecuteTicketBulkInput, TicketBulkConfiguration } from './bulk.types';
import { formatBulkBroadcastMessage } from './format-bulk-broadcast-message';
import { dispatchBroadcastEmail } from './broadcast-email-channel';

export async function applyBulkBroadcast(input: {
  readonly prisma: PrismaService;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly configuration: TicketBulkConfiguration;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<{
  readonly tickets: readonly TicketRecord[];
  readonly recipientCount: number;
}> {
  if (
    input.configuration.broadcastRequirePreview &&
    input.body.previewConfirmed !== true
  ) {
    throw new TicketsError('BULK_PREVIEW_REQUIRED');
  }
  if (
    !bulkBroadcastRateLimiter.consume(
      input.actor.actorUserId,
      input.configuration.broadcastRateLimitPerMinute,
    )
  ) {
    throw new TicketsError('BULK_RATE_LIMITED');
  }
  const body = formatBulkBroadcastMessage(input.body, input.configuration);
  for (const ticket of input.tickets) {
    if (input.configuration.broadcastEnableInApp) {
      input.messages.push(
        await input.prisma.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            type: 'AGENT_REPLY',
            body,
            authorUserId: input.actor.actorUserId,
          },
        }),
      );
    } else if (input.configuration.broadcastEnableEmail) {
      await dispatchBroadcastEmail({
        ticketId: ticket.id,
        body,
        actorUserId: input.actor.actorUserId,
        batchId: input.batchId,
      });
    }
    await auditBulkTicketChange({
      prisma: input.prisma,
      before: ticket,
      after: ticket,
      context: input.actor,
      reason: ticketChangeLogReasons.bulkBroadcast,
      action: ticketSystemEventActions.ticketBulkBroadcast,
      batchId: input.batchId,
      messages: input.messages,
    });
  }
  return {
    tickets: input.tickets,
    recipientCount: countBroadcastRecipients(input.tickets),
  };
}

export function countBroadcastRecipients(
  tickets: readonly TicketRecord[],
): number {
  return new Set(
    tickets.flatMap((ticket) =>
      [ticket.requesterId, ticket.assignedUserId].filter(
        (id): id is string => id !== null && id.length > 0,
      ),
    ),
  ).size;
}
