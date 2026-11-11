import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { permissionKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { executeTemplatesOperation } from '../map-templates-error';
import { PlaybooksService, type PlaybookResponse } from './playbooks.service';
import type { PlaybookInput } from './normalize-playbook-input';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const actorUserId = `playbook-name-actor-${stamp}`;
const createName = `BA07 concurrent create ${stamp}`;
const renameName = `BA07 concurrent rename ${stamp}`;
const inactiveName = `BA07 inactive reservation ${stamp}`;
const createRaceIds = new Set<string>();
const renameRaceIds = [`playbook-name-rename-a-${stamp}`, `playbook-name-rename-b-${stamp}`] as const;
const inactiveId = `playbook-name-inactive-${stamp}`;
const softDeletedReuseId = `playbook-name-reuse-${stamp}`;
const fixtureIds = new Set<string>([...renameRaceIds, inactiveId, softDeletedReuseId]);

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

function playbookService(client: PrismaClient): PlaybooksService {
  return new PlaybooksService(
    client as never,
    { loadBySubjectId: async () => authorizationContext } as never,
    {
      load: async () => ({
        templatesEnabled: true,
        playbooksEnabled: true,
        autoAttach: true,
        requiredStepsOnResolve: 'warn' as const,
      }),
    } as never,
  );
}

function synchronizeNameChecks(client: PrismaClient): {
  readonly client: PrismaClient;
  readonly arrivals: () => number;
} {
  let checkArrivals = 0;
  let releaseChecks: () => void = () => {};
  const bothChecksReady = new Promise<void>((resolve) => {
    releaseChecks = resolve;
  });
  const delegate = client.playbook;
  const originalFindFirst = delegate.findFirst.bind(delegate);
  const synchronizedDelegate = new Proxy(delegate, {
    get(target, property) {
      if (property !== 'findFirst') return Reflect.get(target, property, target);
      return async (...args: Parameters<typeof delegate.findFirst>) => {
        const result = await originalFindFirst(...args);
        const where = args[0]?.where as { readonly name?: unknown } | undefined;
        if (where?.name !== undefined) {
          checkArrivals += 1;
          if (checkArrivals === 2) releaseChecks();
          await bothChecksReady;
        }
        return result;
      };
    },
  });
  const synchronizedClient = new Proxy(client, {
    get(target, property) {
      if (property === 'playbook') return synchronizedDelegate;
      return Reflect.get(target, property, target);
    },
  }) as PrismaClient;
  return { client: synchronizedClient, arrivals: () => checkArrivals };
}

function createInput(name: string, reason: string): PlaybookInput & { readonly reason: string } {
  return {
    name,
    steps: [{ stepKey: 'initial-step', title: 'Initial step', required: true }],
    reason,
  };
}

function updateInput(row: PlaybookResponse, name: string): PlaybookInput & {
  readonly reason: string;
  readonly expectedUpdatedAt: string;
} {
  return {
    name,
    description: row.description,
    isActive: row.isActive,
    serviceIds: row.serviceIds,
    categoryIds: row.categoryIds,
    steps: row.steps.map((step) => ({
      stepKey: step.stepKey,
      title: step.title,
      instructions: step.instructions,
      required: step.required,
      knowledgeArticleId: step.knowledgeArticleId,
      responseTemplateId: step.responseTemplateId,
    })),
    reason: 'BA-templates-07 concurrent rename',
    expectedUpdatedAt: row.updatedAt,
  };
}

function expectNameConflict(result: PromiseSettledResult<unknown>): void {
  expect(result.status).toBe('rejected');
  if (result.status !== 'rejected') return;
  expect(result.reason).toBeInstanceOf(ConflictException);
  const error = result.reason as ConflictException;
  expect(error.getStatus()).toBe(409);
  expect(error.getResponse()).toMatchObject({ code: 'PLAYBOOK_NAME_TAKEN' });
}

describeIfDatabase('playbook case-insensitive live-name uniqueness (PostgreSQL integration, BA-templates-07)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    await prisma.user.create({
      data: {
        id: actorUserId,
        email: `${actorUserId}@example.invalid`,
        displayName: `Playbook name ${stamp}`,
        isLocalOnly: true,
      },
    });
    await Promise.all(
      renameRaceIds.map((id, index) =>
        prisma!.playbook.create({
          data: {
            id,
            name: `BA07 rename source ${index} ${stamp}`,
            isActive: true,
            steps: {
              create: [{ stepKey: 'initial-step', position: 0, title: 'Initial step', required: true }],
            },
          },
        }),
      ),
    );
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    try {
      const ids = [...fixtureIds, ...createRaceIds];
      await prisma.changeLog.deleteMany({
        where: { entityType: 'playbook', entityId: { in: ids } },
      });
      await prisma.playbook.deleteMany({ where: { id: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('serializes concurrent case-insensitive creates and returns one stable conflict', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const synchronized = synchronizeNameChecks(prisma);
    const service = playbookService(synchronized.client);
    const results = await Promise.allSettled([
      executeTemplatesOperation(() =>
        service.create(createInput(createName, 'BA-templates-07 create A'), { actorUserId }),
      ),
      executeTemplatesOperation(() =>
        service.create(createInput(createName.toUpperCase(), 'BA-templates-07 create B'), { actorUserId }),
      ),
    ]);

    expect(synchronized.arrivals()).toBe(2);
    const winners = results.filter((result): result is PromiseFulfilledResult<PlaybookResponse> => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    expectNameConflict(results.find((result) => result.status === 'rejected')!);
    createRaceIds.add(winners[0]!.value.id);

    const rows = await prisma.playbook.findMany({
      where: { name: { equals: createName, mode: 'insensitive' }, deletedAt: null },
    });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.changeLog.count({
      where: { entityType: 'playbook', entityId: rows[0]!.id },
    });
    expect(auditCount).toBe(1);
  });

  it('serializes concurrent case-insensitive renames without partial loser writes', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    const synchronized = synchronizeNameChecks(prisma);
    const service = playbookService(synchronized.client);
    const before = await Promise.all(renameRaceIds.map((id) => service.get(id, { actorUserId })));
    const results = await Promise.allSettled(
      before.map((row, index) =>
        executeTemplatesOperation(() =>
          service.update(
            row.id,
            updateInput(row, index === 0 ? renameName : renameName.toUpperCase()),
            { actorUserId },
          ),
        ),
      ),
    );

    expect(synchronized.arrivals()).toBe(2);
    const winners = results.filter((result): result is PromiseFulfilledResult<PlaybookResponse> => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    expectNameConflict(results.find((result) => result.status === 'rejected')!);

    const rows = await prisma.playbook.findMany({ where: { id: { in: [...renameRaceIds] } } });
    expect(rows.filter((row: { readonly name: string }) => row.name.toLowerCase() === renameName.toLowerCase())).toHaveLength(1);
    expect(rows.filter((row: { readonly name: string }) => row.name.toLowerCase() !== renameName.toLowerCase())).toHaveLength(1);
    const audits = await prisma.changeLog.findMany({
      where: { entityType: 'playbook', entityId: { in: [...renameRaceIds] } },
      select: { entityId: true },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.entityId).toBe(winners[0]!.value.id);
  });

  it('keeps inactive live names reserved and releases a name after soft delete', async () => {
    if (prisma === undefined) throw new Error('PostgreSQL fixture was not initialized');
    await prisma.playbook.create({
      data: { id: inactiveId, name: inactiveName, isActive: false },
    });

    const duplicate = await executeTemplatesOperation(() =>
      prisma!.playbook.create({ data: { name: inactiveName.toUpperCase(), isActive: true } }),
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(duplicate).toBeInstanceOf(ConflictException);
    expect((duplicate as ConflictException).getResponse()).toMatchObject({ code: 'PLAYBOOK_NAME_TAKEN' });

    await prisma.playbook.update({
      where: { id: inactiveId },
      data: { deletedAt: new Date() },
    });
    const replacement = await prisma.playbook.create({
      data: { id: softDeletedReuseId, name: inactiveName.toUpperCase(), isActive: true },
    });
    expect(replacement.name).toBe(inactiveName.toUpperCase());
  });
});
