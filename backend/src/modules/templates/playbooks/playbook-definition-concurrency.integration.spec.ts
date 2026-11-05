import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { permissionKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { PlaybooksService } from './playbooks.service';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const playbookId = `playbook-concurrency-${stamp}`;
const actorUserId = `playbook-concurrency-actor-${stamp}`;
const categoryIds = [`playbook-race-category-a-${stamp}`, `playbook-race-category-b-${stamp}`];
const serviceIds = [`playbook-race-service-a-${stamp}`, `playbook-race-service-b-${stamp}`];
const initialName = `Playbook concurrency base ${stamp}`;

const authorizationContext: AuthorizationContext = {
  subjectId: actorUserId,
  isLocalOnly: true,
  isSuperAdmin: true,
  assignments: [
    {
      roleKey: 'ADMIN',
      permissionKeys: [permissionKeys.ticketTemplatesManage],
      organizationalUnitId: null,
      organizationalUnitPath: null,
      serviceId: null,
    },
  ],
};

describeIfDatabase('playbook definition optimistic concurrency (PostgreSQL integration, BA-templates-03)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }),
    });
    const createdAt = new Date();
    await prisma.user.create({
      data: {
        id: actorUserId,
        email: `${actorUserId}@example.invalid`,
        displayName: `Playbook concurrency ${stamp}`,
        isLocalOnly: true,
      },
    });
    await prisma.serviceCategory.createMany({
      data: categoryIds.map((id, index) => ({
        id,
        name: `Playbook concurrency category ${index} ${stamp}`,
        slug: `playbook-race-category-${index}-${stamp}`,
        createdAt,
        updatedAt: createdAt,
      })),
    });
    await prisma.service.createMany({
      data: serviceIds.map((id, index) => ({
        id,
        name: `Playbook concurrency service ${index} ${stamp}`,
        slug: `playbook-race-service-${index}-${stamp}`,
        categoryId: categoryIds[index]!,
        createdAt,
        updatedAt: createdAt,
      })),
    });
    await prisma.playbook.create({
      data: {
        id: playbookId,
        name: initialName,
        isActive: true,
        version: 1,
        createdAt,
        updatedAt: createdAt,
        steps: {
          create: [
            {
              stepKey: 'initial-step',
              position: 0,
              title: 'Initial step',
              required: true,
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    try {
      await prisma.changeLog.deleteMany({
        where: { entityType: 'playbook', entityId: playbookId },
      });
      await prisma.playbook.deleteMany({ where: { id: playbookId } });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.serviceCategory.deleteMany({
        where: { id: { in: categoryIds } },
      });
      await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('allows one parallel definition replacement and rejects the other without partial rows or audit', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const configuration = {
      load: async () => ({
        templatesEnabled: true,
        playbooksEnabled: true,
        autoAttach: true,
        requiredStepsOnResolve: 'warn' as const,
      }),
    };
    const authorization = {
      loadBySubjectId: async () => authorizationContext,
    };
    const originalTransaction = prisma.$transaction.bind(prisma) as unknown as (...args: unknown[]) => Promise<unknown>;
    let transactionArrivals = 0;
    let releaseTransactions: () => void = () => {};
    const bothWritersReady = new Promise<void>((resolve) => {
      releaseTransactions = resolve;
    });
    const concurrentPrisma = new Proxy(prisma, {
      get(target, property) {
        if (property !== '$transaction') return Reflect.get(target, property, target);
        return async (...args: unknown[]) => {
          transactionArrivals += 1;
          if (transactionArrivals === 2) releaseTransactions();
          await bothWritersReady;
          return originalTransaction(...args);
        };
      },
    });
    const playbooks = new PlaybooksService(concurrentPrisma as never, authorization as never, configuration as never);
    const original = await playbooks.get(playbookId, {
      actorUserId: actorUserId,
    });
    const expectedUpdatedAt = original.updatedAt;
    const proposals = [
      {
        name: `Concurrent winner A ${stamp}`,
        serviceId: serviceIds[0]!,
        categoryId: categoryIds[0]!,
        stepKey: 'concurrent-step-a',
        title: 'Concurrent step A',
      },
      {
        name: `Concurrent winner B ${stamp}`,
        serviceId: serviceIds[1]!,
        categoryId: categoryIds[1]!,
        stepKey: 'concurrent-step-b',
        title: 'Concurrent step B',
      },
    ] as const;

    const results = await Promise.allSettled(
      proposals.map((proposal) =>
        playbooks.update(
          playbookId,
          {
            name: proposal.name,
            serviceIds: [proposal.serviceId],
            categoryIds: [proposal.categoryId],
            steps: [
              {
                stepKey: proposal.stepKey,
                title: proposal.title,
                required: true,
              },
            ],
            reason: `Concurrent edit ${proposal.stepKey}`,
            expectedUpdatedAt,
          },
          { actorUserId },
        ),
      ),
    );

    expect(transactionArrivals).toBe(2);
    const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
    expect(winnerIndex).toBeGreaterThanOrEqual(0);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: 'rejected',
      reason: { code: 'PLAYBOOK_VERSION_CONFLICT' },
    });

    const winner = proposals[winnerIndex]!;
    const finalPlaybook = await playbooks.get(playbookId, { actorUserId });
    expect(finalPlaybook.name).toBe(winner.name);
    expect(finalPlaybook.version).toBe(2);
    expect(finalPlaybook.serviceIds).toEqual([winner.serviceId]);
    expect(finalPlaybook.categoryIds).toEqual([winner.categoryId]);
    expect(finalPlaybook.steps.map((step) => [step.stepKey, step.title])).toEqual([[winner.stepKey, winner.title]]);

    const audit = await prisma.changeLog.findMany({
      where: { entityType: 'playbook', entityId: playbookId },
      select: { diff: true },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.diff).toMatchObject({
      action: 'update',
      before: { name: initialName, version: 1 },
      after: { name: winner.name, version: 2 },
    });
  });

  it('allows one parallel soft-delete and records exactly one additional change log', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const configuration = {
      load: async () => ({
        templatesEnabled: true,
        playbooksEnabled: true,
        autoAttach: true,
        requiredStepsOnResolve: 'warn' as const,
      }),
    };
    const authorization = {
      loadBySubjectId: async () => authorizationContext,
    };
    const originalTransaction = prisma.$transaction.bind(prisma) as unknown as (...args: unknown[]) => Promise<unknown>;
    let transactionArrivals = 0;
    let releaseTransactions: () => void = () => {};
    const bothWritersReady = new Promise<void>((resolve) => {
      releaseTransactions = resolve;
    });
    const concurrentPrisma = new Proxy(prisma, {
      get(target, property) {
        if (property !== '$transaction') return Reflect.get(target, property, target);
        return async (...args: unknown[]) => {
          transactionArrivals += 1;
          if (transactionArrivals === 2) releaseTransactions();
          await bothWritersReady;
          return originalTransaction(...args);
        };
      },
    });
    const playbooks = new PlaybooksService(concurrentPrisma as never, authorization as never, configuration as never);
    const current = await playbooks.get(playbookId, { actorUserId });
    const expectedUpdatedAt = current.updatedAt;
    const beforeAudit = await prisma.changeLog.findMany({
      where: { entityType: 'playbook', entityId: playbookId },
      select: { diff: true },
    });

    const results = await Promise.allSettled(
      ['Concurrent delete A', 'Concurrent delete B'].map((reason) =>
        playbooks.remove(
          playbookId,
          { reason, expectedUpdatedAt },
          { actorUserId },
        ),
      ),
    );

    expect(transactionArrivals).toBe(2);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: 'rejected',
      reason: { code: 'PLAYBOOK_VERSION_CONFLICT' },
    });

    const finalPlaybook = await prisma.playbook.findUnique({ where: { id: playbookId } });
    expect(finalPlaybook?.deletedAt).toBeInstanceOf(Date);
    expect(finalPlaybook?.isActive).toBe(false);

    const afterAudit = await prisma.changeLog.findMany({
      where: { entityType: 'playbook', entityId: playbookId },
      select: { diff: true },
    });
    expect(afterAudit).toHaveLength(beforeAudit.length + 1);
    expect(afterAudit.filter((entry) => (entry.diff as { action?: string }).action === 'delete')).toHaveLength(1);
  });
});
