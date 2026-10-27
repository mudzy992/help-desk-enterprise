import type { Prisma } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JsonValue } from '../change-log/change-log.types';
import {
  collectTicketSlaRuntimeEventIntents,
  emitTicketSlaRuntimeEvents,
  type TicketSlaRuntimeEventIntent,
} from './emit-ticket-sla-runtime-events';
import { persistTicketSlaState } from './persist-ticket-sla-state';
import type { SlaEscalationRuleRecord, TicketSlaStateRecord } from './ticket-sla.types';

export const slaRuntimeEventOutboxTopic = 'sla.runtime.events';

export async function persistTicketSlaRuntimeTransitions(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly previous: Pick<TicketSlaStateRecord, 'isResponseBreached' | 'isResolutionBreached' | 'isResponseAtRisk' | 'isResolutionAtRisk' | 'firedEscalationKeys'>;
    readonly next: Omit<TicketSlaStateRecord, 'updatedAt'>;
    readonly rules: readonly SlaEscalationRuleRecord[];
  },
): Promise<TicketSlaStateRecord> {
  // The in-memory domain harness has no durable outbox. Keep its synchronous
  // adapter explicit; production Prisma always exposes outboxMessage.
  if (!hasDurableOutbox(prisma)) {
    const persisted = await persistTicketSlaState(prisma, input.next);
    await emitTicketSlaRuntimeEvents(prisma, { ...input, next: persisted });
    return persisted;
  }

  const outbox = new TransactionalOutboxService(prisma);
  return prisma.$transaction(async (transaction) => {
    const client = transaction as unknown as PrismaService;
    const persisted = await persistTicketSlaState(client, input.next);
    const intents = collectTicketSlaRuntimeEventIntents({ ...input, next: persisted });
    for (const event of intents) {
      await outbox.enqueue(transaction as Prisma.TransactionClient, {
        topic: slaRuntimeEventOutboxTopic,
        dedupeKey: dedupeKey(event),
        payload: toJson(event),
      });
    }
    return persisted;
  });
}

function hasDurableOutbox(prisma: PrismaService): boolean {
  return (prisma as unknown as { outboxMessage?: unknown }).outboxMessage !== undefined;
}

function dedupeKey(event: TicketSlaRuntimeEventIntent): string {
  return [event.after.id, event.action, event.escalationRuleId ?? 'none'].join(':');
}

function toJson(event: TicketSlaRuntimeEventIntent): JsonValue {
  return JSON.parse(JSON.stringify(event)) as JsonValue;
}
