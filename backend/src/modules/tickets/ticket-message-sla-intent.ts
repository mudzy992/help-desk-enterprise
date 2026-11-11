import type { TicketStatus } from '../../generated/prisma/enums';
import type { JsonValue } from '../change-log/change-log.types';
import type { TicketMessageRecord } from './collaboration.types';
import { ticketSlaEffectsTopic } from './ticket-side-effect-outbox.constants';

export function buildTicketMessageSlaIntent(input: {
  readonly ticketId: string;
  readonly previousStatus: TicketStatus;
  readonly message: Pick<TicketMessageRecord, 'id' | 'type' | 'createdAt'>;
  readonly firstResponseRecorded: boolean;
}): {
  readonly topic: string;
  readonly dedupeKey: string;
  readonly payload: JsonValue;
} | null {
  if (!input.firstResponseRecorded || input.message.type !== 'AGENT_REPLY') {
    return null;
  }

  return {
    topic: ticketSlaEffectsTopic,
    dedupeKey: `ticket-message:${input.message.id}`,
    payload: {
      ticketId: input.ticketId,
      previousStatus: input.previousStatus,
      occurredAt: input.message.createdAt.toISOString(),
      event: 'agent_replied',
    },
  };
}
