import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { ResponseTemplatesService } from './response-templates.service';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const templateId = `response-template-concurrency-${stamp}`;
const actorUserId = `response-template-concurrency-actor-${stamp}`;
const categoryId = `response-template-race-category-${stamp}`;
const serviceIds = [`response-template-race-service-a-${stamp}`, `response-template-race-service-b-${stamp}`];
const initialName = `Response template concurrency base ${stamp}`;

const authorizationContext: AuthorizationContext = {
  subjectId: actorUserId,
  isLocalOnly: true,
  isSuperAdmin: true,
  assignments: [
    {
      roleKey: 'ADMIN',
      permissionKeys: [permissionKeys.ticketTemplatesManage, permissionKeys.ticketTemplatesPersonal],
      organizationalUnitId: null,
      organizationalUnitPath: null,
      serviceId: null,
    },
  ],
};

describeIfDatabase('response-template definition optimistic concurrency (PostgreSQL integration, BA-templates-08)', () => {
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
        displayName: `Response template concurrency ${stamp}`,
        isLocalOnly: true,
      },
    });
    await prisma.serviceCategory.create({
      data: {
        id: categoryId,
        name: `Response template concurrency category ${stamp}`,
        slug: `response-template-race-category-${stamp}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.service.createMany({
      data: serviceIds.map((id, index) => ({
        id,
        name: `Response template concurrency service ${index} ${stamp}`,
        slug: `response-template-race-service-${index}-${stamp}`,
        categoryId,
        createdAt,
        updatedAt: createdAt,
      })),
    });
    await prisma.responseTemplate.create({
      data: {
        id: templateId,
        name: initialName,
        bodyBs: 'Original response text',
        kind: 'REPLY',
        tags: [],
        isActive: true,
        ownerUserId: null,
        createdById: actorUserId,
        updatedById: actorUserId,
        createdAt,
        updatedAt: createdAt,
        services: { create: [{ serviceId: serviceIds[0]! }] },
      },
    });
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    try {
      await prisma.changeLog.deleteMany({
        where: { entityType: 'response_template', entityId: templateId },
      });
      await prisma.responseTemplate.deleteMany({ where: { id: templateId } });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.serviceCategory.deleteMany({ where: { id: categoryId } });
      await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('allows one parallel definition replacement and rejects the other before scope or audit changes', async () => {
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
    const templates = new ResponseTemplatesService(
      concurrentPrisma as never,
      authorization as never,
      {} as never,
      {} as never,
      configuration as never,
    );
    const original = await templates.get(templateId, { actorUserId });
    const expectedUpdatedAt = original.updatedAt;
    const proposals = [
      {
        name: `Concurrent template winner A ${stamp}`,
        bodyBs: 'Concurrent response A',
        serviceId: serviceIds[0]!,
        reason: 'Concurrent replacement A',
      },
      {
        name: `Concurrent template winner B ${stamp}`,
        bodyBs: 'Concurrent response B',
        serviceId: serviceIds[1]!,
        reason: 'Concurrent replacement B',
      },
    ] as const;

    const results = await Promise.allSettled(
      proposals.map((proposal) =>
        templates.update(
          'shared',
          templateId,
          {
            name: proposal.name,
            bodyBs: proposal.bodyBs,
            kind: 'REPLY',
            serviceIds: [proposal.serviceId],
            reason: proposal.reason,
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
      reason: { code: 'TEMPLATE_VERSION_CONFLICT' },
    });

    const winner = proposals[winnerIndex]!;
    const finalTemplate = await prisma.responseTemplate.findUnique({
      where: { id: templateId },
      include: { services: { select: { serviceId: true } } },
    });
    expect(finalTemplate).not.toBeNull();
    expect(finalTemplate).toMatchObject({
      name: winner.name,
      bodyBs: winner.bodyBs,
      services: [{ serviceId: winner.serviceId }],
    });

    const audit = await prisma.changeLog.findMany({
      where: { entityType: 'response_template', entityId: templateId },
      select: { diff: true },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.diff).toMatchObject({
      action: 'update',
      before: { name: initialName, serviceIds: [serviceIds[0]!] },
      after: { name: winner.name, serviceIds: [winner.serviceId] },
    });
  });
});
