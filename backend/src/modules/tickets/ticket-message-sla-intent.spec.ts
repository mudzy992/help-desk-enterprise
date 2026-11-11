import type { TicketStatus } from '../../generated/prisma/enums';
import { ticketSlaEffectsTopic } from './ticket-side-effect-outbox.constants';
import { buildTicketMessageSlaIntent } from './ticket-message-sla-intent';

describe('ticket-message SLA outbox intent', () => {
  const message = {
    id: 'message-00000001',
    type: 'AGENT_REPLY' as const,
    createdAt: new Date('2026-11-04T12:34:56.000Z'),
  };

  it('creates a durable first-response event with a stable message dedupe key', () => {
    expect(
      buildTicketMessageSlaIntent({
        ticketId: 'ticket-00000001',
        previousStatus: 'IN_PROGRESS' as TicketStatus,
        message,
        firstResponseRecorded: true,
      }),
    ).toEqual({
      topic: ticketSlaEffectsTopic,
      dedupeKey: 'ticket-message:message-00000001',
      payload: {
        ticketId: 'ticket-00000001',
        previousStatus: 'IN_PROGRESS',
        occurredAt: '2026-11-04T12:34:56.000Z',
        event: 'agent_replied',
      },
    });
  });

  it('does not enqueue events for later replies or non-agent messages', () => {
    expect(
      buildTicketMessageSlaIntent({
        ticketId: 'ticket-00000001',
        previousStatus: 'IN_PROGRESS' as TicketStatus,
        message,
        firstResponseRecorded: false,
      }),
    ).toBeNull();

    expect(
      buildTicketMessageSlaIntent({
        ticketId: 'ticket-00000001',
        previousStatus: 'IN_PROGRESS' as TicketStatus,
        message: { ...message, type: 'USER_REPLY' },
        firstResponseRecorded: true,
      }),
    ).toBeNull();
  });
});
