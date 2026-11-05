import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { TransactionalOutboxService } from '../../../common/outbox/transactional-outbox.service';
import { fanOutInAppNotifications } from './fan-out-in-app-notifications';
import { notificationTicketMessageFanOutTopic } from './notification-fan-out-outbox.constants';
import { NotificationFanOutOutboxProcessor } from './notification-fan-out-outbox.processor';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('notification ticket-message fan-out outbox', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let ticketId: string;
  let actorId: string;
  let agentId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `Notification outbox ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=NF${stamp}`,
        ouPath: `/nf${stamp}`,
      },
    });
    const category = await prisma.serviceCategory.create({
      data: { name: `Notification outbox ${stamp}`, slug: `nf-cat-${stamp}` },
    });
    const service = await prisma.service.create({
      data: {
        name: `Notification outbox ${stamp}`,
        slug: `nf-svc-${stamp}`,
        categoryId: category.id,
        lifecycle: 'ACTIVE',
      },
    });
    const form = await prisma.formVersion.create({
      data: { serviceId: service.id, version: 1, schema: {} },
    });
    const actor = await prisma.user.create({
      data: {
        email: `notification-outbox-${stamp}@example.test`,
        displayName: 'Notification outbox requester',
      },
    });
    actorId = actor.id;
    const agent = await prisma.user.create({
      data: {
        email: `notification-outbox-agent-${stamp}@example.test`,
        displayName: 'Notification outbox agent',
      },
    });
    agentId = agent.id;
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `NF-${stamp}`,
        title: 'Durable notification fan-out',
        description: 'proof',
        formData: {},
        priority: 'LOW',
        impact: 'LOW',
        urgency: 'LOW',
        status: 'PENDING',
        serviceId: service.id,
        formVersionId: form.id,
        requesterId: actor.id,
        assignedUserId: agent.id,
        originUnitId: unit.id,
      } as never,
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({
      where: {
        topic: {
          in: [notificationTicketMessageFanOutTopic, 'ticket.message.delivery'],
        },
        payload: { path: ['ticketId'], equals: ticketId },
      } as never,
    });
    await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: agentId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('commits one fan-out intent with each message and rolls it back with the message', async () => {
    const messageId = `notification-outbox-commit-${stamp}`;
    const message = await prisma.ticketMessage.create({
      data: {
        id: messageId,
        ticketId,
        type: 'SYSTEM_EVENT',
        body: 'ticket_assigned',
        authorUserId: actorId,
      },
    });

    const intent = await prisma.outboxMessage.findUniqueOrThrow({
      where: {
        topic_dedupeKey: {
          topic: notificationTicketMessageFanOutTopic,
          dedupeKey: message.id,
        },
      },
    });
    expect(intent.status).toBe('PENDING');
    expect(intent.payload).toEqual({ ticketId, messageId: message.id });
    expect(
      await prisma.outboxMessage.count({
        where: {
          topic: notificationTicketMessageFanOutTopic,
          dedupeKey: message.id,
        },
      }),
    ).toBe(1);

    const rollbackMessageId = `notification-outbox-rollback-${stamp}`;
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.ticketMessage.create({
          data: {
            id: rollbackMessageId,
            ticketId,
            type: 'SYSTEM_EVENT',
            body: 'must-rollback',
            authorUserId: actorId,
          },
        });
        throw new Error('INJECTED_AFTER_DURABLE_NOTIFICATION_INTENT');
      }),
    ).rejects.toThrow('INJECTED_AFTER_DURABLE_NOTIFICATION_INTENT');
    expect(
      await prisma.ticketMessage.findUnique({
        where: { id: rollbackMessageId },
      }),
    ).toBeNull();
    expect(
      await prisma.outboxMessage.count({
        where: {
          topic: notificationTicketMessageFanOutTopic,
          dedupeKey: rollbackMessageId,
        },
      }),
    ).toBe(0);
  });

  it('replays a committed message after consumer restart into one inbox row', async () => {
    const messageId = `notification-outbox-replay-${stamp}`;
    await prisma.ticketMessage.create({
      data: {
        id: messageId,
        ticketId,
        type: 'AGENT_REPLY',
        body: 'durable-replay',
        authorUserId: agentId,
      },
    });
    const processor = new NotificationFanOutOutboxProcessor(
      prisma as never,
      new TransactionalOutboxService(prisma as never),
      {
        processDurableTicketMessage: async (payload) => {
          await fanOutInAppNotifications(prisma as never, payload);
        },
      } as never,
    );

    // The event is only in PostgreSQL here; the processor is created afterwards,
    // simulating a process restart between ticket commit and notification work.
    await processor.drain(new Date(0));
    await processor.drain(new Date(0));

    expect(
      await prisma.notification.count({
        where: {
          ticketId,
          userId: actorId,
          dedupeKey: `ticket.message:${messageId}`,
        },
      }),
    ).toBe(1);
    await expect(
      prisma.outboxMessage.findUniqueOrThrow({
        where: {
          topic_dedupeKey: {
            topic: notificationTicketMessageFanOutTopic,
            dedupeKey: messageId,
          },
        },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'SUCCEEDED' });
  });
});
