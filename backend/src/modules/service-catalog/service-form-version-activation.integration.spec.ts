import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceFormsService } from './service-forms.service';
import { defaultServiceFormsConfiguration } from './service-forms.constants';
import { ensureInstallSeedFormVersion } from '../install/ensure-install-seed-form-version';
import { applyCatalogSnapshot } from '../config-versioning/apply-catalog-snapshot';
import { createConfigSnapshotFixture } from '../config-versioning/create-config-snapshot-fixture';
import { computeCatalogStateHash } from '../config-versioning/catalog-state-hash';
import type { ConfigSnapshot } from '../config-versioning/config-versioning.types';
import {
  toFormVersionSnapshot,
  toServiceSnapshot,
} from '../config-versioning/serialize-config-snapshot';
import { withServiceFormActivationLock } from './with-service-form-activation-lock';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;
const firstApplicationName = `ba05-activate-a-${stamp}`.slice(0, 63);
const secondApplicationName = `ba05-activate-b-${stamp}`.slice(0, 63);
const installApplicationName = `ba05-install-${stamp}`.slice(0, 63);
const snapshotApplicationName = `ba05-snapshot-${stamp}`.slice(0, 63);
const snapshotActivatorApplicationName = `ba05-snap-activate-${stamp}`.slice(
  0,
  63,
);
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

type ActivationFixture = {
  readonly serviceId: string;
  readonly formVersionIds: readonly [string, string];
  readonly actorUserId: string;
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describeIfDatabase(
  'concurrent service form-version activation (PostgreSQL integration, BA-05)',
  () => {
    jest.setTimeout(120_000);

    let prisma: PrismaClient | undefined;
    let firstActivator: PrismaClient | undefined;
    let secondActivator: PrismaClient | undefined;
    let installSeedClient: PrismaClient | undefined;
    let snapshotClient: PrismaClient | undefined;
    let snapshotActivator: PrismaClient | undefined;
    const categoryIds: string[] = [];
    const serviceIds: string[] = [];
    const formVersionIds: string[] = [];
    const userIds: string[] = [];

    const db = (): PrismaClient => {
      if (prisma === undefined) {
        throw new Error('PostgreSQL test client nije inicijalizovan');
      }
      return prisma;
    };

    const activator = (client: PrismaClient | undefined): PrismaClient => {
      if (client === undefined) {
        throw new Error('Activation test client nije inicijalizovan');
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

    const createFixture = async (label: string): Promise<ActivationFixture> => {
      const suffix = `${stamp}-${label}`;
      const category = await db().serviceCategory.create({
        data: {
          name: `BA-05 category ${suffix}`,
          slug: `ba05-category-${suffix}`,
        },
        select: { id: true },
      });
      categoryIds.push(category.id);

      const service = await db().service.create({
        data: {
          name: `BA-05 service ${suffix}`,
          slug: `ba05-service-${suffix}`,
          categoryId: category.id,
          lifecycle: 'ACTIVE',
        },
        select: { id: true },
      });
      serviceIds.push(service.id);
      const user = await db().user.create({
        data: {
          email: `ba05-${suffix}@example.test`,
          displayName: `BA-05 test actor ${label}`,
        },
        select: { id: true },
      });
      userIds.push(user.id);

      const forms = await Promise.all(
        [1, 2].map((version) =>
          db().formVersion.create({
            data: {
              serviceId: service.id,
              version,
              schema: validSchema,
              status: 'DRAFT',
            },
            select: { id: true },
          }),
        ),
      );
      const ids: [string, string] = [forms[0].id, forms[1].id];
      formVersionIds.push(...ids);
      return {
        serviceId: service.id,
        formVersionIds: ids,
        actorUserId: user.id,
      };
    };

    const holdServiceLock = async (
      serviceId: string,
    ): Promise<{ release: () => void; result: Promise<void> }> => {
      const ready = deferred();
      const release = deferred();
      const result = db().$transaction(
        async (transaction) =>
          withServiceFormActivationLock(transaction, serviceId, async () => {
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
        throw new Error(
          'BA-05 lock-holding transaction closed before acquiring its lock',
        );
      }
      return { release: release.resolve, result };
    };

    const holdCatalogSnapshotLock = async (
      snapshot: ConfigSnapshot,
    ): Promise<{ release: () => void; result: Promise<unknown> }> => {
      const ready = deferred();
      const release = deferred();
      const result = activator(snapshotClient).$transaction(
        async (transaction) => {
          await transaction.$executeRaw`
            LOCK TABLE "Service", "FormVersion" IN SHARE ROW EXCLUSIVE MODE
          `;
          ready.resolve();
          await release.promise;
          return applyCatalogSnapshot(
            transaction,
            snapshot,
            defaultServiceLifecycleConfiguration,
          );
        },
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
        throw new Error(
          'BA-05 snapshot transaction closed before acquiring its table lock',
        );
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
      throw new Error('BA-05 PostgreSQL klijent nije čekao na očekivani DB lock');
    };

    const snapshotForCatalog = async (): Promise<ConfigSnapshot> => {
      const [services, versions] = await Promise.all([
        db().service.findMany({ orderBy: { id: 'asc' } }),
        db().formVersion.findMany({
          orderBy: [{ serviceId: 'asc' }, { version: 'asc' }],
        }),
      ]);
      const base = createConfigSnapshotFixture();
      return {
        ...base,
        catalogStateHash: computeCatalogStateHash(services, versions),
        catalog: { services: services.map(toServiceSnapshot) },
        forms: { versions: versions.map(toFormVersionSnapshot) },
      };
    };

    beforeAll(() => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      firstActivator = createNamedClient(firstApplicationName);
      secondActivator = createNamedClient(secondApplicationName);
      installSeedClient = createNamedClient(installApplicationName);
      snapshotClient = createNamedClient(snapshotApplicationName);
      snapshotActivator = createNamedClient(snapshotActivatorApplicationName);
    });

    afterAll(async () => {
      const client = prisma;
      try {
        if (client !== undefined) {
          if (formVersionIds.length > 0) {
            await client.changeLog.deleteMany({
              where: { entityId: { in: formVersionIds } },
            });
            await client.formVersion.deleteMany({
              where: { id: { in: formVersionIds } },
            });
          }
          if (serviceIds.length > 0) {
            await client.service.deleteMany({
              where: { id: { in: serviceIds } },
            });
          }
          if (userIds.length > 0) {
            await client.user.deleteMany({ where: { id: { in: userIds } } });
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
          firstActivator?.$disconnect(),
          secondActivator?.$disconnect(),
          installSeedClient?.$disconnect(),
          snapshotClient?.$disconnect(),
          snapshotActivator?.$disconnect(),
        ]);
      }
    });

    it('serializes two concurrent activations and leaves exactly one ACTIVE version', async () => {
      const fixture = await createFixture('parallel');
      const held = await holdServiceLock(fixture.serviceId);
      const pending = [
        createFormsService(activator(firstActivator)).activateFormVersion(
          fixture.serviceId,
          fixture.formVersionIds[0],
        ),
        createFormsService(activator(secondActivator)).activateFormVersion(
          fixture.serviceId,
          fixture.formVersionIds[1],
        ),
      ];

      let waitError: unknown;
      try {
        await waitForLockWaiters([
          firstApplicationName,
          secondApplicationName,
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

      const versions = await db().formVersion.findMany({
        where: { serviceId: fixture.serviceId },
        orderBy: { version: 'asc' },
        select: { id: true, status: true },
      });
      expect(
        versions.filter((version) => version.status === 'ACTIVE'),
      ).toHaveLength(1);
      expect(versions.map((version) => version.status).sort()).toEqual([
        'ACTIVE',
        'RETIRED',
      ]);
    });

    it('shares the per-service lock between API and install-seed activation', async () => {
      const fixture = await createFixture('api-install-seed');
      const held = await holdServiceLock(fixture.serviceId);
      const apiActivation = createFormsService(
        activator(firstActivator),
      ).activateFormVersion(fixture.serviceId, fixture.formVersionIds[0]);
      const installActivation = ensureInstallSeedFormVersion(
        activator(installSeedClient) as never,
        {
          serviceId: fixture.serviceId,
          actorUserId: fixture.actorUserId,
          forms: defaultServiceFormsConfiguration,
        },
      );

      let waitError: unknown;
      try {
        await waitForLockWaiters([
          firstApplicationName,
          installApplicationName,
        ]);
      } catch (error) {
        waitError = error;
      } finally {
        held.release();
      }

      await held.result;
      const outcomes = await Promise.allSettled([
        apiActivation,
        installActivation,
      ]);
      if (waitError !== undefined) throw waitError;
      expect(outcomes.map((outcome) => outcome.status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
      const versions = await db().formVersion.findMany({
        where: { serviceId: fixture.serviceId },
        orderBy: { version: 'asc' },
        select: { status: true },
      });
      expect(
        versions.filter((version) => version.status === 'ACTIVE'),
      ).toHaveLength(1);
      expect(versions[0]?.status).toBe('ACTIVE');
      expect(['DRAFT', 'RETIRED']).toContain(versions[1]?.status);
    });

    it('serializes activation with applyCatalogSnapshot table locks', async () => {
      const fixture = await createFixture('snapshot');
      await db().formVersion.update({
        where: { id: fixture.formVersionIds[0] },
        data: { status: 'ACTIVE' },
      });
      const snapshot = await snapshotForCatalog();
      const held = await holdCatalogSnapshotLock(snapshot);
      const activation = createFormsService(
        activator(snapshotActivator),
      ).activateFormVersion(fixture.serviceId, fixture.formVersionIds[1]);

      let waitError: unknown;
      try {
        await waitForLockWaiters([snapshotActivatorApplicationName]);
      } catch (error) {
        waitError = error;
      } finally {
        held.release();
      }

      await held.result;
      const outcome = await Promise.allSettled([activation]);
      if (waitError !== undefined) throw waitError;
      expect(outcome[0]?.status).toBe('fulfilled');
      const versions = await db().formVersion.findMany({
        where: { serviceId: fixture.serviceId },
        orderBy: { version: 'asc' },
        select: { status: true },
      });
      expect(versions.map((version) => version.status)).toEqual([
        'RETIRED',
        'ACTIVE',
      ]);
    });
  },
);
