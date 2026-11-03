import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { ChangeScheduleService } from '../changes/change-schedule.service';
import { ServiceAvailabilityService } from './service-availability.service';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';
import { withServiceDowntimeWindowMutationLock } from './with-service-downtime-window-mutation-lock';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const firstWriterApplicationName = `ba07-downtime-a-${stamp}`.slice(0, 63);
const secondWriterApplicationName = `ba07-downtime-b-${stamp}`.slice(0, 63);
const changeWriterApplicationName = `ba07-downtime-change-${stamp}`.slice(0, 63);
const evaluatedAt = new Date('2034-12-31T00:00:00.000Z');

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describeIfDatabase(
  'concurrent service downtime overlap protection (PostgreSQL integration, BA-07)',
  () => {
    jest.setTimeout(120_000);

    let prisma: PrismaClient | undefined;
    let firstWriter: PrismaClient | undefined;
    let secondWriter: PrismaClient | undefined;
    let changeWriter: PrismaClient | undefined;
    const categoryIds: string[] = [];
    const serviceIds: string[] = [];
    const organizationalUnitIds: string[] = [];
    const changeIds: string[] = [];

    const db = (): PrismaClient => {
      if (prisma === undefined) {
        throw new Error('BA-07 PostgreSQL klijent nije inicijalizovan');
      }
      return prisma;
    };

    const writer = (client: PrismaClient | undefined): PrismaClient => {
      if (client === undefined) {
        throw new Error('BA-07 writer klijent nije inicijalizovan');
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

    const createAvailabilityService = (
      client: PrismaClient,
    ): ServiceAvailabilityService => {
      const catalog = new ServiceCatalogService(
        client as never,
        { load: async () => defaultServiceLifecycleConfiguration } as never,
      );
      return new ServiceAvailabilityService(client as never, catalog);
    };

    const createChangeScheduleService = (
      client: PrismaClient,
    ): ChangeScheduleService =>
      new ChangeScheduleService(
        client as never,
        { configuration: async () => ({ numberPrefix: 'CHG' }) } as never,
        { load: async () => ({ downtime: { enabled: true } }) } as never,
      );

    const createFixture = async (
      label: string,
    ): Promise<{ serviceId: string }> => {
      const suffix = `${stamp}-${label}`;
      const category = await db().serviceCategory.create({
        data: {
          name: `BA-07 category ${suffix}`,
          slug: `ba07-category-${suffix}`,
        },
        select: { id: true },
      });
      categoryIds.push(category.id);
      const service = await db().service.create({
        data: {
          name: `BA-07 service ${suffix}`,
          slug: `ba07-service-${suffix}`,
          categoryId: category.id,
        },
        select: { id: true },
      });
      serviceIds.push(service.id);
      return { serviceId: service.id };
    };

    const holdDowntimeLock = async (
      serviceId: string,
    ): Promise<{ release: () => void; result: Promise<void> }> => {
      const ready = deferred();
      const release = deferred();
      const result = db().$transaction(
        async (transaction) =>
          withServiceDowntimeWindowMutationLock(
            transaction,
            serviceId,
            async () => {
              ready.resolve();
              await release.promise;
            },
          ),
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
        throw new Error('BA-07 lock-holder zatvorio se prije dobijanja locka');
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
      throw new Error('BA-07 writeri nisu čekali na očekivani PostgreSQL lock');
    };

    const expectOverlapConflict = (error: unknown): void => {
      expect(error).toBeInstanceOf(ConflictException);
      const conflict = error as ConflictException;
      expect(conflict.getStatus()).toBe(409);
      expect(conflict.getResponse()).toMatchObject({
        code: 'OVERLAPPING_DOWNTIME_WINDOW',
      });
    };

    beforeAll(() => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      firstWriter = createNamedClient(firstWriterApplicationName);
      secondWriter = createNamedClient(secondWriterApplicationName);
      changeWriter = createNamedClient(changeWriterApplicationName);
    });

    afterAll(async () => {
      const client = prisma;
      try {
        if (client !== undefined) {
          const windows =
            serviceIds.length === 0
              ? []
              : await client.serviceDowntimeWindow.findMany({
                  where: { serviceId: { in: serviceIds } },
                  select: { id: true },
                });
          const windowIds = windows.map((window) => window.id);
          if (windowIds.length > 0) {
            await client.changeLog.deleteMany({
              where: { entityId: { in: windowIds } },
            });
            await client.serviceDowntimeWindow.deleteMany({
              where: { id: { in: windowIds } },
            });
          }
          if (changeIds.length > 0) {
            await client.changeRequest.deleteMany({
              where: { id: { in: changeIds } },
            });
          }
          if (organizationalUnitIds.length > 0) {
            await client.organizationalUnit.deleteMany({
              where: { id: { in: organizationalUnitIds } },
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
        await Promise.all([
          client?.$disconnect(),
          firstWriter?.$disconnect(),
          secondWriter?.$disconnect(),
          changeWriter?.$disconnect(),
        ]);
      }
    });

    it('allows only one of two concurrent overlapping window creates', async () => {
      const fixture = await createFixture('create-create');
      const held = await holdDowntimeLock(fixture.serviceId);
      const pending = [
        createAvailabilityService(writer(firstWriter)).createDowntimeWindow(
          fixture.serviceId,
          {
            startsAt: '2035-01-01T10:00:00.000Z',
            endsAt: '2035-01-01T11:00:00.000Z',
            message: 'First concurrent window',
            reason: 'BA-07 concurrent create test',
          },
          { actorUserId: null },
          evaluatedAt,
        ),
        createAvailabilityService(writer(secondWriter)).createDowntimeWindow(
          fixture.serviceId,
          {
            startsAt: '2035-01-01T10:30:00.000Z',
            endsAt: '2035-01-01T11:30:00.000Z',
            message: 'Overlapping concurrent window',
            reason: 'BA-07 concurrent create test',
          },
          { actorUserId: null },
          evaluatedAt,
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
      expectOverlapConflict(rejected[0]?.reason);

      const windows = await db().serviceDowntimeWindow.findMany({
        where: { serviceId: fixture.serviceId },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: { id: true, startsAt: true, endsAt: true },
      });
      expect(windows).toHaveLength(1);
      expect(
        await db().changeLog.findFirst({
          where: {
            entityId: windows[0]!.id,
            reason: 'BA-07 concurrent create test',
          },
          select: { id: true },
        }),
      ).not.toBeNull();
    });

    it('serializes concurrent update-versus-create overlap checks', async () => {
      const fixture = await createFixture('update-create');
      const availability = createAvailabilityService(db());
      const existing = await availability.createDowntimeWindow(
        fixture.serviceId,
        {
          startsAt: '2035-01-02T10:00:00.000Z',
          endsAt: '2035-01-02T11:00:00.000Z',
          message: 'Existing window',
          reason: 'BA-07 update-create fixture',
        },
        { actorUserId: null },
        evaluatedAt,
      );
      const existingWindow = await db().serviceDowntimeWindow.findFirst({
        where: { serviceId: fixture.serviceId },
        select: { id: true },
      });
      expect(existingWindow).not.toBeNull();
      expect(existing.serviceId).toBe(fixture.serviceId);

      const held = await holdDowntimeLock(fixture.serviceId);
      const pending = [
        createAvailabilityService(writer(firstWriter)).updateDowntimeWindow(
          fixture.serviceId,
          existingWindow!.id,
          {
            startsAt: '2035-01-02T12:00:00.000Z',
            endsAt: '2035-01-02T13:00:00.000Z',
            reason: 'BA-07 concurrent update test',
          },
          { actorUserId: null },
          evaluatedAt,
        ),
        createAvailabilityService(writer(secondWriter)).createDowntimeWindow(
          fixture.serviceId,
          {
            startsAt: '2035-01-02T12:30:00.000Z',
            endsAt: '2035-01-02T13:30:00.000Z',
            message: 'Competing window',
            reason: 'BA-07 concurrent create test',
          },
          { actorUserId: null },
          evaluatedAt,
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
      expectOverlapConflict(rejected[0]?.reason);

      const windows = await db().serviceDowntimeWindow.findMany({
        where: { serviceId: fixture.serviceId },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: { startsAt: true, endsAt: true },
      });
      expect(windows.length).toBeGreaterThanOrEqual(1);
      for (let index = 1; index < windows.length; index += 1) {
        expect(windows[index - 1]!.endsAt.getTime()).toBeLessThanOrEqual(
          windows[index]!.startsAt.getTime(),
        );
      }
    });

    it('serializes change-schedule sync with API downtime creates', async () => {
      const fixture = await createFixture('change-create');
      const suffix = `${stamp}-change`;
      const unit = await db().organizationalUnit.create({
        data: {
          name: `BA-07 change OU ${suffix}`,
          type: 'DIRECTORATE',
          distinguishedName: `OU=BA07-${suffix}`,
          ouPath: `/ba07/${suffix}`,
        },
        select: { id: true },
      });
      organizationalUnitIds.push(unit.id);

      const change = await db().changeRequest.create({
        data: {
          sequence: 2_000_000 + Math.floor(Math.random() * 100_000),
          title: `BA-07 scheduled downtime ${suffix}`,
          description: 'PostgreSQL concurrency fixture',
          reason: 'BA-07 change-sync integration test',
          organizationalUnitId: unit.id,
          status: 'SCHEDULED',
          causesDowntime: true,
          plannedStart: new Date('2035-01-03T10:00:00.000Z'),
          plannedEnd: new Date('2035-01-03T11:00:00.000Z'),
        },
        select: { id: true },
      });
      changeIds.push(change.id);
      await db().changeRequestService.create({
        data: { changeId: change.id, serviceId: fixture.serviceId },
      });

      const held = await holdDowntimeLock(fixture.serviceId);
      const pendingSync = createChangeScheduleService(
        writer(changeWriter),
      ).syncDowntime(change.id, null);
      const pendingApi = createAvailabilityService(
        writer(firstWriter),
      ).createDowntimeWindow(
        fixture.serviceId,
        {
          startsAt: '2035-01-03T10:30:00.000Z',
          endsAt: '2035-01-03T11:30:00.000Z',
          message: 'Competing manual window',
          reason: 'BA-07 change-sync race test',
        },
        { actorUserId: null },
        evaluatedAt,
      );

      let waitError: unknown;
      try {
        await waitForLockWaiters([
          changeWriterApplicationName,
          firstWriterApplicationName,
        ]);
      } catch (error) {
        waitError = error;
      } finally {
        held.release();
      }
      await held.result;
      const [syncOutcome, apiOutcome] = await Promise.allSettled([
        pendingSync,
        pendingApi,
      ]);
      if (waitError !== undefined) throw waitError;
      expect(syncOutcome.status).toBe('fulfilled');
      if (apiOutcome.status === 'rejected') {
        expectOverlapConflict(apiOutcome.reason);
      }

      const windows = await db().serviceDowntimeWindow.findMany({
        where: { serviceId: fixture.serviceId },
        select: { id: true, startsAt: true, endsAt: true, changeRequestId: true },
      });
      expect(windows).toHaveLength(1);
      expect(
        (windows[0]!.changeRequestId === change.id) ===
          (apiOutcome.status === 'rejected'),
      ).toBe(true);
      const event = await db().changeEvent.findFirst({
        where: { changeId: change.id, action: 'downtime' },
        select: { id: true },
      });
      expect(event).not.toBeNull();
    });
  },
);
