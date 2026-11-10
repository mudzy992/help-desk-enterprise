import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';
import { withServiceCategoryParentMutationLock } from './with-service-category-parent-mutation-lock';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const firstWriterApplicationName = `ba08-category-a-${stamp}`.slice(0, 63);
const secondWriterApplicationName = `ba08-category-b-${stamp}`.slice(0, 63);

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describeIfDatabase(
  'category parent graph concurrency (PostgreSQL integration, BA-08)',
  () => {
    jest.setTimeout(120_000);

    let prisma: PrismaClient | undefined;
    let firstWriter: PrismaClient | undefined;
    let secondWriter: PrismaClient | undefined;
    const categoryIds: string[] = [];

    const db = (): PrismaClient => {
      if (prisma === undefined) {
        throw new Error('BA-08 PostgreSQL klijent nije inicijalizovan');
      }
      return prisma;
    };

    const writer = (client: PrismaClient | undefined): PrismaClient => {
      if (client === undefined) {
        throw new Error('BA-08 writer klijent nije inicijalizovan');
      }
      return client;
    };

    const createNamedClient = (applicationName: string): PrismaClient => {
      const url = new URL(databaseUrl!);
      url.searchParams.set('application_name', applicationName);
      return new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }),
      });
    };

    const createCatalog = (client: PrismaClient): ServiceCatalogService =>
      new ServiceCatalogService(
        client as never,
        { load: async () => defaultServiceLifecycleConfiguration } as never,
      );

    const createRoot = async (label: string): Promise<{ id: string }> => {
      const category = await db().serviceCategory.create({
        data: {
          name: `BA-08 ${label} ${stamp}`,
          slug: `ba08-${label}-${stamp}`,
        },
        select: { id: true },
      });
      categoryIds.push(category.id);
      return category;
    };

    const holdCategoryTreeLock = async (): Promise<{
      release: () => void;
      result: Promise<void>;
    }> => {
      const ready = deferred();
      const release = deferred();
      const result = db().$transaction(
        async (transaction) =>
          withServiceCategoryParentMutationLock(transaction, async () => {
            ready.resolve();
            await release.promise;
          }),
        { timeout: 30_000, isolationLevel: 'ReadCommitted' },
      );
      const readiness = await Promise.race([
        ready.promise.then(() => ({ state: 'ready' as const })),
        result.then(
          () => ({ state: 'finished' as const }),
          (error: unknown) => ({ state: 'failed' as const, error }),
        ),
      ]);
      if (readiness.state !== 'ready') {
        release.resolve();
        if (readiness.state === 'failed') throw readiness.error;
        throw new Error('BA-08 lock-holder završio se prije dobijanja locka');
      }
      return { release: release.resolve, result };
    };

    const waitForLockWaiters = async (
      applicationNames: readonly string[],
    ): Promise<void> => {
      const deadline = Date.now() + 4_000;
      while (Date.now() < deadline) {
        const waiting = await Promise.all(
          applicationNames.map(async (applicationName) => {
            const rows = await db().$queryRaw<Array<{ pid: number }>>`
              SELECT "pid"
              FROM pg_stat_activity
              WHERE "application_name" = ${applicationName}
                AND "datname" = current_database()
                AND cardinality(pg_blocking_pids("pid")) > 0
              LIMIT 1
            `;
            return rows.length > 0;
          }),
        );
        if (waiting.every(Boolean)) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(
        'BA-08 category writers nisu čekali na graph advisory lock',
      );
    };

    const expectCircularCategoryError = (error: unknown): void => {
      expect(error).toBeInstanceOf(BadRequestException);
      const badRequest = error as BadRequestException;
      expect(badRequest.getStatus()).toBe(400);
      expect(badRequest.getResponse()).toMatchObject({
        code: 'CIRCULAR_CATEGORY',
      });
    };

    const expectAcyclicFixture = async (): Promise<void> => {
      const categories = await db().serviceCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, parentId: true },
      });
      const parentById = new Map(
        categories.map((category) => [category.id, category.parentId]),
      );
      for (const category of categories) {
        const visited = new Set([category.id]);
        let cursor = category.parentId;
        while (cursor !== null && parentById.has(cursor)) {
          expect(visited.has(cursor)).toBe(false);
          visited.add(cursor);
          cursor = parentById.get(cursor) ?? null;
        }
      }
    };

    beforeAll(() => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      firstWriter = createNamedClient(firstWriterApplicationName);
      secondWriter = createNamedClient(secondWriterApplicationName);
    });

    afterAll(async () => {
      const client = prisma;
      try {
        if (client !== undefined && categoryIds.length > 0) {
          await client.serviceCategory.updateMany({
            where: { id: { in: categoryIds } },
            data: { parentId: null },
          });
          await client.changeLog.deleteMany({
            where: { entityId: { in: categoryIds } },
          });
          await client.serviceCategory.deleteMany({
            where: { id: { in: categoryIds } },
          });
        }
      } finally {
        await Promise.all([
          client?.$disconnect(),
          firstWriter?.$disconnect(),
          secondWriter?.$disconnect(),
        ]);
      }
    });

    it('serializes opposing reparent updates and prevents a concurrent cycle', async () => {
      const first = await createRoot('first-root');
      const second = await createRoot('second-root');
      const held = await holdCategoryTreeLock();
      const pending = [
        createCatalog(writer(firstWriter)).updateCategory(
          first.id,
          { parentId: second.id },
          '"v1"',
        ),
        createCatalog(writer(secondWriter)).updateCategory(
          second.id,
          { parentId: first.id },
          '"v1"',
        ),
      ];

      let waitError: unknown;
      try {
        await waitForLockWaiters([
          firstWriterApplicationName,
          secondWriterApplicationName,
        ]);
      } catch (error) {
        waitError = error;
      } finally {
        held.release();
      }
      await held.result;
      const outcomes = await Promise.allSettled(pending);
      if (waitError !== undefined) throw waitError;

      const fulfilled = outcomes.filter(
        (outcome) => outcome.status === 'fulfilled',
      );
      const rejected = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expectCircularCategoryError(rejected[0]?.reason);
      await expectAcyclicFixture();
    });

    it('takes the shared graph lock for every parented category create', async () => {
      const root = await createRoot('create-parent');
      const held = await holdCategoryTreeLock();
      const pending = [
        createCatalog(writer(firstWriter)).createCategory({
          name: `BA-08 child-a ${stamp}`,
          slug: `ba08-child-a-${stamp}`,
          parentId: root.id,
        }),
        createCatalog(writer(secondWriter)).createCategory({
          name: `BA-08 child-b ${stamp}`,
          slug: `ba08-child-b-${stamp}`,
          parentId: root.id,
        }),
      ];

      let waitError: unknown;
      try {
        await waitForLockWaiters([
          firstWriterApplicationName,
          secondWriterApplicationName,
        ]);
      } catch (error) {
        waitError = error;
      } finally {
        held.release();
      }
      await held.result;
      const outcomes = await Promise.allSettled(pending);
      if (waitError !== undefined) throw waitError;

      expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(
        true,
      );
      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled') categoryIds.push(outcome.value.id);
      }
      await expectAcyclicFixture();
      const children = await db().serviceCategory.findMany({
        where: { parentId: root.id },
        select: { id: true, parentId: true },
      });
      expect(children).toHaveLength(2);
      expect(
        children.every((category) => categoryIds.includes(category.id)),
      ).toBe(true);
    });
  },
);
