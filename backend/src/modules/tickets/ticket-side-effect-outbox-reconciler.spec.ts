jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../../common/outbox/transactional-outbox.service', () => ({
  TransactionalOutboxService: class TransactionalOutboxService {},
}));
jest.mock('../sla/ticket-sla-timers.service', () => ({
  TicketSlaTimersService: class TicketSlaTimersService {},
}));

import type {
  OutboxDelivery,
  OutboxHandler,
} from '../../common/outbox/transactional-outbox.service';
import { ticketSlaEffectsTopic } from './ticket-side-effect-outbox.constants';
import { TicketSideEffectOutboxReconciler } from './ticket-side-effect-outbox-reconciler.service';
import type { TicketRecord } from './tickets.types';

describe('TicketSideEffectOutboxReconciler SLA delivery', () => {
  const eventCases: readonly (readonly [string, Readonly<Record<string, unknown>>, string])[] = [
    ['first agent reply', { event: 'agent_replied' }, 'agent_replied'],
    ['status trigger', { statusChanged: true, priorityChanged: false }, 'status_changed'],
    ['priority trigger', { statusChanged: false, priorityChanged: true }, 'priority_changed'],
  ];

  it.each(eventCases)('routes the %s event to the SLA timer', async (_label, fields, expectedEvent) => {
    const occurredAt = new Date('2026-11-04T12:34:56.000Z');
    const ticket = {
      id: 'ticket-00000001',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      serviceId: 'service-00000001',
      originUnitId: 'unit-00000001',
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
      firstResponseAt: occurredAt,
      resolvedAt: null,
    } as unknown as TicketRecord;
    const delivery = {
      id: 'outbox-00000001',
      topic: ticketSlaEffectsTopic,
      dedupeKey: 'ticket-message:message-00000001',
      payload: {
        ticketId: ticket.id,
        previousStatus: 'IN_PROGRESS',
        occurredAt: occurredAt.toISOString(),
        ...fields,
      },
      attempts: 1,
      maxAttempts: 10,
      ownerToken: 'owner-00000001',
    } as unknown as OutboxDelivery;
    const slaTimers = { apply: jest.fn().mockResolvedValue(null) };
    let pending = true;
    const outbox = {
      dispatchOne: async (topic: string, handler: OutboxHandler) => {
        if (topic !== ticketSlaEffectsTopic || !pending) return 'idle' as const;
        pending = false;
        await handler(delivery);
        return 'succeeded' as const;
      },
    };
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticket) },
    };
    const reconciler = new TicketSideEffectOutboxReconciler(
      prisma as never,
      outbox as never,
      {} as never,
      slaTimers as never,
    );

    await reconciler.drain();

    expect(slaTimers.apply).toHaveBeenCalledTimes(1);
    expect(slaTimers.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: 'IN_PROGRESS',
        now: occurredAt,
        event: expectedEvent,
      }),
    );
  });
});
