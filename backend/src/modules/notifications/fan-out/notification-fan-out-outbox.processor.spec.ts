jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../../../common/outbox/transactional-outbox.service', () => ({
  TransactionalOutboxService: class TransactionalOutboxService {},
}));

import type {
  OutboxDelivery,
  OutboxHandler,
  TransactionalOutboxService,
} from '../../../common/outbox/transactional-outbox.service';
import type { NotificationsFanOutService } from './notifications-fan-out.service';
import { NotificationFanOutOutboxProcessor } from './notification-fan-out-outbox.processor';
import { notificationTicketMessageFanOutTopic } from './notification-fan-out-outbox.constants';

const message = {
  id: 'message-0000001',
  ticketId: 'ticket-0000001',
  type: 'USER_REPLY',
  body: 'hello',
  authorUserId: 'user-0000001',
  createdAt: new Date('2026-11-05T10:00:00.000Z'),
  source: 'APP',
};
const ticket = {
  id: 'ticket-0000001',
  requesterId: 'requester-0000001',
  assignedGroupId: 'group-0000001',
};
const delivery = {
  id: 'outbox-0000001',
  topic: notificationTicketMessageFanOutTopic,
  dedupeKey: message.id,
  payload: { ticketId: ticket.id, messageId: message.id },
  attempts: 1,
  maxAttempts: 10,
  ownerToken: 'owner-0000001',
} as OutboxDelivery;

describe('NotificationFanOutOutboxProcessor', () => {
  function setup() {
    const prisma = {
      ticketMessage: { findUnique: jest.fn().mockResolvedValue(message) },
      ticket: { findUnique: jest.fn().mockResolvedValue(ticket) },
      outboxMessage: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const outbox = {
      dispatchOne: jest.fn().mockResolvedValue('idle'),
      replayDeadLetter: jest.fn().mockResolvedValue(undefined),
    };
    const fanOut = { processDurableTicketMessage: jest.fn().mockResolvedValue(undefined) };
    const processor = new NotificationFanOutOutboxProcessor(
      prisma as never,
      outbox as unknown as TransactionalOutboxService,
      fanOut as unknown as NotificationsFanOutService,
    );
    return { prisma, outbox, fanOut, processor };
  }

  beforeEach(() => jest.clearAllMocks());

  it('loads the persisted message and completes its notification fan-out', async () => {
    const { outbox, fanOut, processor } = setup();
    outbox.dispatchOne
      .mockImplementationOnce(async (_topic: string, handler: OutboxHandler) => {
        await handler(delivery);
        return 'succeeded';
      })
      .mockResolvedValueOnce('idle');

    await processor.drain(new Date(0));

    expect(outbox.dispatchOne).toHaveBeenCalledWith(
      notificationTicketMessageFanOutTopic,
      expect.any(Function),
    );
    expect(fanOut.processDurableTicketMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: message.id,
        ticketId: ticket.id,
        requesterId: ticket.requesterId,
        assignedGroupId: ticket.assignedGroupId,
        visibility: 'public',
      }),
    );
  });

  it('treats a deleted source message as a successful no-op', async () => {
    const { prisma, outbox, fanOut, processor } = setup();
    prisma.ticketMessage.findUnique.mockResolvedValueOnce(null);
    outbox.dispatchOne.mockImplementationOnce(
      async (_topic: string, handler: OutboxHandler) => {
        await handler(delivery);
        return 'succeeded';
      },
    );

    await processor.drain(new Date(0));

    expect(fanOut.processDurableTicketMessage).not.toHaveBeenCalled();
  });

  it('lets malformed intents fail through to the outbox retry policy', async () => {
    const { outbox, processor } = setup();
    const malformed = { ...delivery, payload: { messageId: 42 } } as OutboxDelivery;
    let retryError: unknown;
    outbox.dispatchOne
      .mockImplementationOnce(async (_topic: string, handler: OutboxHandler) => {
        try {
          await handler(malformed);
          return 'succeeded';
        } catch (error) {
          retryError = error;
          return 'retry';
        }
      })
      .mockResolvedValueOnce('idle');

    await processor.drain(new Date(0));

    expect(retryError).toEqual(new Error('INVALID_NOTIFICATION_TICKET_MESSAGE_FANOUT'));
  });

  it('reports backlog and dead-letter state as degraded health', async () => {
    const { prisma, processor } = setup();
    const now = new Date('2026-11-05T10:00:00.000Z');
    prisma.outboxMessage.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prisma.outboxMessage.findFirst.mockResolvedValueOnce({
      createdAt: new Date(now.getTime() - 6 * 60_000),
    });

    await expect(processor.health(now)).resolves.toEqual({
      status: 'degraded',
      pending: 2,
      processing: 1,
      deadLetter: 1,
      oldestPendingAgeMs: 6 * 60_000,
    });
  });

  it('replays eligible dead letters with automatic-recovery provenance', async () => {
    const { prisma, outbox, processor } = setup();
    const now = new Date('2026-11-05T10:00:00.000Z');
    prisma.outboxMessage.findMany.mockResolvedValueOnce([{ id: 'dead-0000001' }]);

    await processor.drain(now);

    expect(prisma.outboxMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          topic: notificationTicketMessageFanOutTopic,
          status: 'DEAD_LETTER',
        }),
        take: 10,
      }),
    );
    expect(outbox.replayDeadLetter).toHaveBeenCalledWith('dead-0000001', {
      actor: 'notification-fanout-reconciler',
      reason:
        'Automatic recovery retry after notification fan-out dead-letter cooldown',
    });
  });
});
