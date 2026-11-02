import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { defaultServiceFormsConfiguration } from './service-forms.constants';
import { ServiceFormsService } from './service-forms.service';
import { withServiceFormVersionMutationLock } from './with-service-form-activation-lock';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const firstWriterApplicationName = `ba06-create-a-${stamp}`.slice(0, 63);
const secondWriterApplicationName = `ba06-create-b-${stamp}`.slice(0, 63);
const validSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'summary',
      label: 'Summary',
      type: 'text',
      required: true,
      order: 0,
    },
  ],
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describeIfDatabase(
  'concurrent service form-version creation (PostgreSQL integration, BA-06)',
  () => {
    jest.setTimeout(120_000);

    let prisma: PrismaClient | undefined;
    let firstWriter: PrismaClient | undefined;
    let secondWriter: PrismaClient | undefined;
    const categoryIds: string[] = [];
    const serviceIds: string[] = [];
    const formVersionIds: string[] = [];

    const db = (): PrismaClient => {
      if (prisma === undefined) {
        throw new Error('BA-06 PostgreSQL klijent nije inicijalizovan');
      }
      return prisma;
    };

    const writer = (client: PrismaClient | undefined): PrismaClient => {
      if (client === undefined) {
        throw new Error('BA-06 writer klijent nije inicijalizovan');
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

    const createFormsService = (client: PrismaClient): ServiceFormsService =>
      new ServiceFormsService(
        client as never,
        { load: async () => defaultServiceFormsConfiguration } as never,
      );

    const createFixture = async (label: string): Promise<{ serviceId: string }> => {
      const suffix = `${stamp}-${label}`;
      const category = await db().serviceCategory.create({
        data: {
          name: `BA-06 category ${suffix}`,
          slug: `ba06-category-${suffix}`,
        },
        select: { id: true },
      });
      categoryIds.push(category.id);
      const service = await db().service.create({
        data: {
          name: `BA-06 service ${suffix}`,
          slug: `ba06-service-${suffix}`,
          categoryId: category.id,
          lifecycle: 'ACTIVE',
        },
        select: { id: true },
      });
      serviceIds.push(service.id);
      return { serviceId: service.id };
    };

    const holdServiceFormVersionLock = async (
      serviceId: string,
    ): Promise<{ release: () => void; result: Promise<void> }> => {
      const ready = deferred();
      const release = deferred();
      const result = db().$transaction(
        async (transaction) =>
          withServiceFormVersionMutationLock(transaction, serviceId, async () => {
            ready.resolve();
            await release.promise;
          }),
        { timeout: 30_000 },
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
        throw new Error('BA-06 lock-holder zatvorio se prije dobijanja locka');
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
      throw new Error('BA-06 klijenti nisu čekali na očekivani PostgreSQL lock');
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
        if (client !== undefined) {
          const persistedFormVersions =
            serviceIds.length > 0
              ? await client.formVersion.findMany({
                  where: { serviceId: { in: serviceIds } },
                  select: { id: true },
                })
              : [];
          const formIds = [
            ...new Set([
              ...formVersionIds,
              ...persistedFormVersions.map((version) => version.id),
            ]),
          ];
          if (formIds.length > 0) {
            await client.changeLog.deleteMany({
              where: { entityId: { in: formIds } },
            });
            await client.formVersion.deleteMany({
              where: { id: { in: formIds } },
            });
          }
          if (serviceIds.length > 0) {
            await client.service.deleteMany({ where: { id: { in: serviceIds } } });
          }
          if (categoryIds.length > 0) {
            await client.serviceCategory.deleteMany({
              where: { id: { in: categoryIds } },
            });
          }
        }
      } finally {
        await Promise.all([client?.$disconnect(), firstWriter?.$disconnect(), secondWriter?.$disconnect()]);
      }
    });

    it('returns one stable 409 when concurrent requests create the first form', async () => {
      const fixture = await createFixture('first-form');
      const held = await holdServiceFormVersionLock(fixture.serviceId);
      const pending = [
        createFormsService(writer(firstWriter)).createForm(fixture.serviceId, {
          schema: validSchema,
        }),
        createFormsService(writer(secondWriter)).createForm(fixture.serviceId, {
          schema: validSchema,
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

      const fulfilled = outcomes.filter(
        (outcome) => outcome.status === 'fulfilled',
      );
      const rejected = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(ConflictException);
      const conflict = rejected[0]?.reason as ConflictException;
      expect(conflict.getStatus()).toBe(409);
      expect(conflict.getResponse()).toMatchObject({
        code: 'FORM_ALREADY_EXISTS',
      });

      const versions = await db().formVersion.findMany({
        where: { serviceId: fixture.serviceId },
        orderBy: { version: 'asc' },
        select: { id: true, version: true, status: true },
      });
      formVersionIds.push(...versions.map((version) => version.id));
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ version: 1, status: 'DRAFT' });
      expect(
        await db().changeLog.count({ where: { entityId: versions[0]!.id } }),
      ).toBe(1);
    });

    it('allocates distinct sequential versions for concurrent version requests', async () => {
      const fixture = await createFixture('next-version');
      const initial = await createFormsService(db()).createForm(
        fixture.serviceId,
        { schema: validSchema },
      );
      formVersionIds.push(initial.formVersionRef);

      const held = await holdServiceFormVersionLock(fixture.serviceId);
      const pending = [
        createFormsService(writer(firstWriter)).createFormVersion(
          fixture.serviceId,
          { schema: validSchema },
        ),
        createFormsService(writer(secondWriter)).createFormVersion(
          fixture.serviceId,
          { schema: validSchema },
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
      const results = await Promise.allSettled(pending);
      if (waitError !== undefined) throw waitError;
      expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

      const created = results.map((result) => {
        if (result.status !== 'fulfilled') throw result.reason;
        formVersionIds.push(result.value.formVersionRef);
        return result.value.version;
      });
      expect(created.sort((left, right) => left - right)).toEqual([2, 3]);

      const versions = await db().formVersion.findMany({
        where: { serviceId: fixture.serviceId },
        orderBy: { version: 'asc' },
        select: { version: true, status: true },
      });
      expect(versions.map((version) => version.version)).toEqual([1, 2, 3]);
      expect(versions.every((version) => version.status === 'DRAFT')).toBe(true);
      expect(
        await db().changeLog.count({
          where: { entityId: { in: formVersionIds } },
        }),
      ).toBe(3);
    });
  },
);
