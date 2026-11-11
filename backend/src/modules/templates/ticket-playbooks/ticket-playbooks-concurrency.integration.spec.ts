import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { permissionKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import type { TicketRecord } from '../../tickets/tickets.types';
import { TicketRealtimeHub } from '../../tickets/ticket-realtime.hub';
import { loadAccessibleTicket } from '../../tickets/load-accessible-ticket';
import { attachPlaybookToTicket } from './attach-playbook-to-ticket';
import { TicketPlaybooksService } from './ticket-playbooks.service';
import { TemplatesError } from '../templates.error';

jest.mock('../../tickets/load-accessible-ticket', () => ({
  loadAccessibleTicket: jest.fn(),
}));

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
let sequence = 0;

const loadAccessibleTicketMock = loadAccessibleTicket as jest.Mock;

type Fixture = {
  readonly ticketId: string;
  readonly playbookId: string;
  readonly actorUserId: string;
  readonly unitId: string;
  readonly serviceId: string;
  readonly categoryId: string;
  readonly ticketNumber: string;
};

describeIfDatabase('ticket playbook mutation serialization (PostgreSQL integration, BA-templates-04/10)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  const fixtures: Fixture[] = [];

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    try {
      for (const fixture of [...fixtures].reverse()) {
        await prisma.changeLog.deleteMany({
          where: { entityType: 'ticket_playbook', actorUserId: fixture.actorUserId },
        });
        await prisma.ticket.deleteMany({ where: { id: fixture.ticketId } });
        await prisma.playbook.deleteMany({ where: { id: fixture.playbookId } });
        await prisma.service.deleteMany({ where: { id: fixture.serviceId } });
        await prisma.serviceCategory.deleteMany({ where: { id: fixture.categoryId } });
        await prisma.organizationalUnit.deleteMany({ where: { id: fixture.unitId } });
        await prisma.user.deleteMany({ where: { id: fixture.actorUserId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createFixture(stepKeys: readonly string[]): Promise<Fixture & { ticket: TicketRecord; playbookName: string }> {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const id = `${stamp}-${++sequence}`;
    const fixture: Fixture = {
      ticketId: `templates-ticket-${id}`,
      ticketNumber: `TPL-${stamp.replace(/\D/gu, '').slice(-8)}-${sequence}`,
      playbookId: `templates-playbook-${id}`,
      actorUserId: `templates-actor-${id}`,
      unitId: `templates-unit-${id}`,
      serviceId: `templates-service-${id}`,
      categoryId: `templates-category-${id}`,
    };
    fixtures.push(fixture);
    const createdAt = new Date();
    const playbookName = `Concurrent checklist ${id}`;
    await prisma.serviceCategory.create({
      data: { id: fixture.categoryId, name: `Category ${id}`, slug: `templates-category-${id}`, createdAt, updatedAt: createdAt },
    });
    await prisma.service.create({
      data: { id: fixture.serviceId, name: `Service ${id}`, slug: `templates-service-${id}`, categoryId: fixture.categoryId, createdAt, updatedAt: createdAt },
    });
    await prisma.organizationalUnit.create({
      data: {
        id: fixture.unitId,
        name: `Unit ${id}`,
        type: 'SERVICE',
        distinguishedName: `CN=templates-${id},OU=Integration,DC=example,DC=invalid`,
        ouPath: `/integration/templates-${id}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.user.create({
      data: { id: fixture.actorUserId, email: `${fixture.actorUserId}@example.invalid`, displayName: `Actor ${id}`, isLocalOnly: true },
    });
    const ticket = await prisma.ticket.create({
      data: {
        id: fixture.ticketId,
        ticketNumber: fixture.ticketNumber,
        title: `Ticket ${id}`,
        description: 'Ticket used by the template checklist integration test.',
        status: 'PENDING',
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
    await prisma.playbook.create({
      data: {
        id: fixture.playbookId,
        name: playbookName,
        isActive: true,
        version: 1,
        createdAt,
        updatedAt: createdAt,
        steps: {
          create: stepKeys.map((stepKey, position) => ({
            stepKey,
            position,
            title: `Step ${stepKey}`,
            instructions: `Instructions for ${stepKey}`,
            required: true,
          })),
        },
      },
    });
    return { ...fixture, ticket: ticket as unknown as TicketRecord, playbookName };
  }

  function createService(fixture: Fixture & { ticket: TicketRecord }): TicketPlaybooksService {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const authorizationContext: AuthorizationContext = {
      subjectId: fixture.actorUserId,
      isLocalOnly: true,
      isSuperAdmin: true,
      assignments: [
        {
          roleKey: 'ADMIN',
          permissionKeys: [permissionKeys.ticketTemplatesUse],
          organizationalUnitId: null,
          organizationalUnitPath: null,
          serviceId: null,
        },
      ],
    };
    loadAccessibleTicketMock.mockResolvedValue({
      ticket: fixture.ticket,
      access: { visibility: 'staff' },
    });
    const authorization = { loadBySubjectId: async () => authorizationContext };
    const accessPolicies = { bind: async () => ({}) };
    const configuration = {
      load: async () => ({
        templatesEnabled: true,
        playbooksEnabled: true,
        autoAttach: true,
        requiredStepsOnResolve: 'warn' as const,
      }),
    };
    return new TicketPlaybooksService(
      prisma as never,
      authorization as never,
      accessPolicies as never,
      new TicketRealtimeHub(),
      configuration as never,
    );
  }

  async function attachFixture(fixture: Fixture & { ticket: TicketRecord }): Promise<void> {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    await attachPlaybookToTicket({
      prisma: prisma as never,
      ticket: fixture.ticket,
      playbookId: fixture.playbookId,
      actorUserId: fixture.actorUserId,
      autoAttached: false,
      messages: [],
    });
  }

  it('serializes concurrent completion attempts and writes the completion event once', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const fixture = await createFixture(['first', 'last']);
    await attachFixture(fixture);
    const service = createService(fixture);
    await service.setStep(fixture.ticketId, 'first', true, { actorUserId: fixture.actorUserId });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.setStep(fixture.ticketId, 'last', true, { actorUserId: fixture.actorUserId })),
    );
    expect(results).toHaveLength(8);
    const checklist = await prisma.ticketPlaybook.findFirstOrThrow({
      where: { ticketId: fixture.ticketId, detachedAt: null },
      include: { steps: true },
    });
    expect(checklist.steps.map((step) => step.stepKey).sort()).toEqual(['first', 'last']);
    const completionEvents = await prisma.ticketMessage.findMany({
      where: { ticketId: fixture.ticketId, body: { startsWith: 'ticket_playbook_completed:' } },
      select: { idempotencyKey: true },
    });
    expect(completionEvents).toHaveLength(1);
    expect(completionEvents[0]?.idempotencyKey).toMatch(/^playbook-completed:/);
    expect(completionEvents[0]?.idempotencyKey?.length).toBeLessThanOrEqual(128);
    expect(await prisma.changeLog.count({
      where: { entityType: 'ticket_playbook', entityId: checklist.id, reason: 'playbook_step_checked' },
    })).toBe(2);
  });

  it('keeps checklist snapshot and checked rows consistent when upgrade races a step mutation', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const fixture = await createFixture(['keep', 'remove']);
    await attachFixture(fixture);
    const service = createService(fixture);
    await service.setStep(fixture.ticketId, 'keep', true, { actorUserId: fixture.actorUserId });

    await prisma.playbookStep.deleteMany({ where: { playbookId: fixture.playbookId } });
    await prisma.playbookStep.createMany({
      data: [
        { playbookId: fixture.playbookId, stepKey: 'keep', position: 0, title: 'Kept step v2', required: true },
        { playbookId: fixture.playbookId, stepKey: 'new', position: 1, title: 'New step v2', required: true },
      ],
    });
    await prisma.playbook.update({
      where: { id: fixture.playbookId },
      data: { version: 2, name: `${fixture.playbookName} v2` },
    });

    const [stepResult, upgradeResult] = await Promise.allSettled([
      service.setStep(fixture.ticketId, 'remove', true, { actorUserId: fixture.actorUserId }),
      service.upgrade(fixture.ticketId, { actorUserId: fixture.actorUserId }),
    ]);
    expect(upgradeResult.status).toBe('fulfilled');
    if (stepResult.status === 'rejected') {
      expect(stepResult.reason).toBeInstanceOf(TemplatesError);
      expect(stepResult.reason).toMatchObject({ code: 'TICKET_PLAYBOOK_STEP_NOT_FOUND' });
    }

    const checklist = await prisma.ticketPlaybook.findFirstOrThrow({
      where: { ticketId: fixture.ticketId, detachedAt: null },
      include: { steps: true },
    });
    const snapshot = checklist.stepsSnapshot as Array<{ stepKey: string }>;
    const snapshotKeys = snapshot.map((step) => step.stepKey).sort();
    expect(checklist.playbookVersion).toBe(2);
    expect(snapshotKeys).toEqual(['keep', 'new']);
    expect(checklist.steps.map((step) => step.stepKey)).toEqual(['keep']);
    expect(checklist.steps.every((step) => snapshotKeys.includes(step.stepKey))).toBe(true);
  });

  it('enforces one active checklist per ticket and permits detached history', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const fixture = await createFixture(['only-step']);
    const snapshot = [
      {
        stepKey: 'only-step',
        title: 'Step only-step',
        instructions: null,
        required: true,
        knowledgeArticleId: null,
        responseTemplateId: null,
      },
    ];
    const first = await prisma.ticketPlaybook.create({
      data: {
        id: `ticket-playbook-${stamp}-${sequence}-first`,
        ticketId: fixture.ticketId,
        playbookId: fixture.playbookId,
        playbookVersion: 1,
        playbookName: fixture.playbookName,
        stepsSnapshot: snapshot,
        attachedById: fixture.actorUserId,
      },
    });
    await expect(prisma.ticketPlaybook.create({
      data: {
        id: `ticket-playbook-${stamp}-${sequence}-duplicate`,
        ticketId: fixture.ticketId,
        playbookId: fixture.playbookId,
        playbookVersion: 1,
        playbookName: fixture.playbookName,
        stepsSnapshot: snapshot,
        attachedById: fixture.actorUserId,
      },
    })).rejects.toMatchObject({ code: 'P2002' });

    await prisma.ticketPlaybook.update({ where: { id: first.id }, data: { detachedAt: new Date() } });
    await prisma.ticketPlaybook.create({
      data: {
        id: `ticket-playbook-${stamp}-${sequence}-replacement`,
        ticketId: fixture.ticketId,
        playbookId: fixture.playbookId,
        playbookVersion: 1,
        playbookName: fixture.playbookName,
        stepsSnapshot: snapshot,
        attachedById: fixture.actorUserId,
      },
    });
    await prisma.ticketPlaybook.create({
      data: {
        id: `ticket-playbook-${stamp}-${sequence}-detached-history`,
        ticketId: fixture.ticketId,
        playbookId: fixture.playbookId,
        playbookVersion: 1,
        playbookName: fixture.playbookName,
        stepsSnapshot: snapshot,
        attachedById: fixture.actorUserId,
        detachedAt: new Date(),
      },
    });
    expect(await prisma.ticketPlaybook.count({ where: { ticketId: fixture.ticketId, detachedAt: null } })).toBe(1);
    expect(await prisma.ticketPlaybook.count({ where: { ticketId: fixture.ticketId, detachedAt: { not: null } } })).toBe(2);
  });

  it('serializes competing attach operations and exposes the active-row index as a backstop', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const fixture = await createFixture(['only-step']);
    const attach = () => attachPlaybookToTicket({
      prisma: prisma as never,
      ticket: fixture.ticket,
      playbookId: fixture.playbookId,
      actorUserId: fixture.actorUserId,
      autoAttached: false,
      messages: [],
    });
    const results = await Promise.allSettled([attach(), attach()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'TICKET_PLAYBOOK_ALREADY_ATTACHED' },
    });
    expect(await prisma.ticketPlaybook.count({ where: { ticketId: fixture.ticketId, detachedAt: null } })).toBe(1);
  });
});
