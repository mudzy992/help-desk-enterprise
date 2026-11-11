import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { enqueueTicketPlaybookAutoAttachIntent } from './enqueue-ticket-playbook-auto-attach-intent';
import {
  ticketMessageDeliveryTopic,
  ticketPlaybookAutoAttachTopic,
  ticketSlaEffectsTopic,
  TicketSideEffectOutboxReconciler,
} from './ticket-side-effect-outbox-reconciler.service';
import type { TicketRecord } from './tickets.types';

type Fixture = {
  readonly id: string;
  readonly ticketId: string;
  readonly ticketNumber: string;
  readonly actorUserId: string;
  readonly unitId: string;
  readonly categoryId: string;
  readonly serviceId: string;
  readonly playbookIds: readonly string[];
};

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
let sequence = 0;

describeIfDatabase('ticket playbook auto-attach/realtime outbox (PostgreSQL integration, BA-templates-05/11)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let outbox: TransactionalOutboxService;
  const fixtures: Fixture[] = [];

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    outbox = new TransactionalOutboxService(prisma as never);
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    try {
      for (const fixture of [...fixtures].reverse()) {
        await prisma.outboxMessage.deleteMany({
          where: { topic: ticketPlaybookAutoAttachTopic, dedupeKey: fixture.ticketId },
        });
        await prisma.outboxMessage.deleteMany({
          where: {
            topic: { in: [ticketMessageDeliveryTopic, ticketSlaEffectsTopic] },
            payload: { path: ['ticketId'], equals: fixture.ticketId },
          } as never,
        });
        const checklistRows = await prisma.ticketPlaybook.findMany({
          where: { ticketId: fixture.ticketId },
          select: { id: true },
        });
        await prisma.changeLog.deleteMany({
          where: {
            entityType: 'ticket_playbook',
            entityId: { in: checklistRows.map(({ id }) => id) },
          },
        });
        await prisma.ticket.deleteMany({ where: { id: fixture.ticketId } });
        await prisma.playbook.deleteMany({ where: { id: { in: [...fixture.playbookIds] } } });
        await prisma.service.deleteMany({ where: { id: fixture.serviceId } });
        await prisma.serviceCategory.deleteMany({ where: { id: fixture.categoryId } });
        await prisma.organizationalUnit.deleteMany({ where: { id: fixture.unitId } });
        await prisma.user.deleteMany({ where: { id: fixture.actorUserId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createFixture(options: {
    readonly matchingPlaybooks?: number;
    readonly status?: 'PENDING' | 'CLOSED';
  } = {}): Promise<Fixture & { ticket: TicketRecord }> {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const id = `${stamp}-${++sequence}`;
    const fixture: Fixture = {
      id,
      ticketId: `templates-auto-ticket-${id}`,
      ticketNumber: `TAT-${stamp.replace(/\D/gu, '').slice(-8)}-${sequence}`,
      actorUserId: `templates-auto-actor-${id}`,
      unitId: `templates-auto-unit-${id}`,
      categoryId: `templates-auto-category-${id}`,
      serviceId: `templates-auto-service-${id}`,
      playbookIds: Array.from({ length: options.matchingPlaybooks ?? 0 }, (_, index) =>
        `templates-auto-playbook-${id}-${index + 1}`,
      ),
    };
    fixtures.push(fixture);
    const createdAt = new Date();
    await prisma.serviceCategory.create({
      data: {
        id: fixture.categoryId,
        name: `Auto-attach category ${id}`,
        slug: `templates-auto-category-${id}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.service.create({
      data: {
        id: fixture.serviceId,
        name: `Auto-attach service ${id}`,
        slug: `templates-auto-service-${id}`,
        categoryId: fixture.categoryId,
        lifecycle: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.organizationalUnit.create({
      data: {
        id: fixture.unitId,
        name: `Auto-attach unit ${id}`,
        type: 'SERVICE',
        distinguishedName: `CN=templates-auto-${id},OU=Integration,DC=example,DC=invalid`,
        ouPath: `/integration/templates-auto-${id}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.user.create({
      data: {
        id: fixture.actorUserId,
        email: `${fixture.actorUserId}@example.invalid`,
        displayName: `Auto-attach actor ${id}`,
        isLocalOnly: true,
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        id: fixture.ticketId,
        ticketNumber: fixture.ticketNumber,
        title: `Auto-attach ticket ${id}`,
        description: 'Durable auto-attach integration fixture.',
        status: options.status ?? 'PENDING',
        priority: 'MEDIUM',
        impact: 'MEDIUM',
        urgency: 'MEDIUM',
        formData: {},
        originUnitId: fixture.unitId,
        serviceId: fixture.serviceId,
        requesterId: fixture.actorUserId,
        createdAt,
        updatedAt: createdAt,
      },
    });
    for (const [index, playbookId] of fixture.playbookIds.entries()) {
      await prisma.playbook.create({
        data: {
          id: playbookId,
          name: `Auto-attach playbook ${id} ${index + 1}`,
          isActive: true,
          version: 1,
          createdAt,
          updatedAt: createdAt,
          services: { create: [{ serviceId: fixture.serviceId }] },
          steps: {
            create: [{ stepKey: `step-${index + 1}`, position: 0, title: 'Check the service', required: true }],
          },
        },
      });
    }
    return { ...fixture, ticket: ticket as unknown as TicketRecord };
  }

  async function enqueueIntent(ticketId: string): Promise<void> {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    await prisma.$transaction((transaction) =>
      enqueueTicketPlaybookAutoAttachIntent(outbox, transaction, ticketId).then(() => undefined),
    );
  }

  function createReconciler(
    configuration: {
      readonly playbooksEnabled: boolean;
      readonly autoAttach: boolean;
      readonly load?: () => Promise<{ readonly playbooksEnabled: boolean; readonly autoAttach: boolean }>;
    },
    realtimeHub?: TicketRealtimeHub,
  ): TicketSideEffectOutboxReconciler {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const hub = realtimeHub ?? new TicketRealtimeHub();
    if (realtimeHub === undefined) {
      // The ordinary auto-attach cases are not testing WebSocket delivery.
      // Keep their worker fixture wired like production, where the Redis
      // forwarder subscribes to both projections.
      hub.subscribe(() => undefined);
      hub.subscribeTicketUpdated(() => undefined);
    }
    return new TicketSideEffectOutboxReconciler(
      prisma as never,
      outbox,
      hub,
      { apply: async () => undefined } as never,
      {
        load: configuration.load ?? (async () => ({
          playbooksEnabled: configuration.playbooksEnabled,
          autoAttach: configuration.autoAttach,
        })),
      } as never,
    );
  }

  async function activeChecklistCount(ticketId: string): Promise<number> {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    return prisma.ticketPlaybook.count({ where: { ticketId, detachedAt: null } });
  }

  it('rolls the durable intent back with the ticket transaction', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const fixture = await createFixture();
    const rollbackTicketId = `templates-auto-rollback-${fixture.id}`;
    const rollbackTicketNumber = `TAR-${stamp.replace(/\D/gu, '').slice(-8)}-${sequence}`;

    await expect(prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.create({
        data: {
          id: rollbackTicketId,
          ticketNumber: rollbackTicketNumber,
          title: 'Ticket and intent must roll back',
          description: 'Rollback proof',
          status: 'PENDING',
          priority: 'LOW',
          impact: 'LOW',
          urgency: 'LOW',
          formData: {},
          originUnitId: fixture.unitId,
          serviceId: fixture.serviceId,
          requesterId: fixture.actorUserId,
        },
      });
      await enqueueTicketPlaybookAutoAttachIntent(outbox, transaction, ticket.id);
      throw new Error('INJECTED_AFTER_AUTO_ATTACH_INTENT');
    })).rejects.toThrow('INJECTED_AFTER_AUTO_ATTACH_INTENT');

    expect(await prisma.ticket.findUnique({ where: { id: rollbackTicketId } })).toBeNull();
    expect(await prisma.outboxMessage.count({
      where: { topic: ticketPlaybookAutoAttachTopic, dedupeKey: rollbackTicketId },
    })).toBe(0);
  });

  it('retries a temporary configuration failure and redelivery remains idempotent', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const fixture = await createFixture({ matchingPlaybooks: 1 });
    await enqueueIntent(fixture.ticketId);
    const duplicate = await prisma.$transaction((transaction) =>
      enqueueTicketPlaybookAutoAttachIntent(outbox, transaction, fixture.ticketId),
    );
    expect(duplicate.created).toBe(false);

    let reads = 0;
    const reconciler = createReconciler({
      playbooksEnabled: true,
      autoAttach: true,
      load: async () => {
        reads += 1;
        if (reads === 1) throw new Error('temporary settings outage');
        return { playbooksEnabled: true, autoAttach: true };
      },
    });
    await reconciler.drain();
    const failed = await prisma.outboxMessage.findUniqueOrThrow({
      where: { topic_dedupeKey: { topic: ticketPlaybookAutoAttachTopic, dedupeKey: fixture.ticketId } },
    });
    expect(failed).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(await activeChecklistCount(fixture.ticketId)).toBe(0);
    expect(await reconciler.health()).toMatchObject({ pending: 1, deadLetter: 0 });

    await prisma.outboxMessage.update({
      where: { id: failed.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await reconciler.drain();
    expect(await activeChecklistCount(fixture.ticketId)).toBe(1);
    await prisma.outboxMessage.update({
      where: { id: failed.id },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(0),
        ownerToken: null,
        leaseExpiresAt: null,
        completedAt: null,
        lastError: null,
      },
    });
    await reconciler.drain();
    expect(await activeChecklistCount(fixture.ticketId)).toBe(1);
    expect(await prisma.ticketMessage.count({
      where: { ticketId: fixture.ticketId, body: { startsWith: 'ticket_playbook_attached:' } },
    })).toBe(1);
    const completed = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: failed.id } });
    expect(completed.status).toBe('SUCCEEDED');
  });

  it('does not attach when disabled, ambiguous, unmatched, or terminal', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const disabled = await createFixture({ matchingPlaybooks: 1 });
    await enqueueIntent(disabled.ticketId);
    await createReconciler({ playbooksEnabled: false, autoAttach: false }).drain();
    expect(await activeChecklistCount(disabled.ticketId)).toBe(0);

    const unmatched = await createFixture();
    await enqueueIntent(unmatched.ticketId);
    await createReconciler({ playbooksEnabled: true, autoAttach: true }).drain();
    expect(await activeChecklistCount(unmatched.ticketId)).toBe(0);

    const ambiguous = await createFixture({ matchingPlaybooks: 2 });
    await enqueueIntent(ambiguous.ticketId);
    await createReconciler({ playbooksEnabled: true, autoAttach: true }).drain();
    expect(await activeChecklistCount(ambiguous.ticketId)).toBe(0);

    const closed = await createFixture({ matchingPlaybooks: 1, status: 'CLOSED' });
    await enqueueIntent(closed.ticketId);
    await createReconciler({ playbooksEnabled: true, autoAttach: true }).drain();
    expect(await activeChecklistCount(closed.ticketId)).toBe(0);
  });

  it('periodically attaches the single matching playbook to an open ticket without a checklist', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const fixture = await createFixture({ matchingPlaybooks: 1 });
    await enqueueIntent(fixture.ticketId);

    await createReconciler({ playbooksEnabled: true, autoAttach: true }).drain();

    const checklist = await prisma.ticketPlaybook.findFirstOrThrow({
      where: { ticketId: fixture.ticketId, detachedAt: null },
    });
    expect(checklist).toMatchObject({
      playbookId: fixture.playbookIds[0],
      autoAttached: true,
      attachedById: null,
    });
  });

  it('retries a persisted playbook event when realtime bridge delivery fails', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const fixture = await createFixture({ matchingPlaybooks: 1 });
    await enqueueIntent(fixture.ticketId);

    const hub = new TicketRealtimeHub();
    let failFirstDelivery = true;
    const deliveredMessageIds: string[] = [];
    const updatedMessageIds: string[] = [];
    hub.subscribeAwaited((payload) => {
      if (payload.ticketId !== fixture.ticketId) return;
      if (failFirstDelivery) {
        failFirstDelivery = false;
        throw new Error('injected realtime bridge failure');
      }
      deliveredMessageIds.push(payload.id);
    });
    hub.subscribeTicketUpdatedAwaited((payload) => {
      if (payload.ticketId === fixture.ticketId && payload.sourceMessageId !== null) {
        updatedMessageIds.push(payload.sourceMessageId);
      }
    });

    const reconciler = createReconciler({ playbooksEnabled: true, autoAttach: true }, hub);
    await reconciler.drain();

    const event = await prisma.ticketMessage.findFirstOrThrow({
      where: { ticketId: fixture.ticketId, body: { startsWith: 'ticket_playbook_attached:' } },
      select: { id: true },
    });
    const pending = await prisma.outboxMessage.findUniqueOrThrow({
      where: { topic_dedupeKey: { topic: ticketMessageDeliveryTopic, dedupeKey: event.id } },
    });
    expect(pending).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(pending.lastError).toContain('injected realtime bridge failure');
    expect(await reconciler.health()).toMatchObject({ pending: 1, deadLetter: 0 });

    await prisma.outboxMessage.update({ where: { id: pending.id }, data: { nextAttemptAt: new Date(0) } });
    await reconciler.drain();

    const delivered = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: pending.id } });
    expect(delivered.status).toBe('SUCCEEDED');
    expect(deliveredMessageIds).toEqual([event.id]);
    expect(updatedMessageIds).toEqual([event.id]);
  });
});
