import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { OptimisticConcurrencyError } from '../../common/optimistic-concurrency/optimistic-concurrency.error';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import {
  serviceCategoryChangeLogEntityType,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import { ServiceCatalogService } from './service-catalog.service';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;

describeIfDatabase('service catalog optimistic concurrency PostgreSQL integration (BA-09)', () => {
  jest.setTimeout(120_000);

  let adminClient: PrismaClient | undefined;
  let serviceWriter: PrismaClient | undefined;
  let categoryWriter: PrismaClient | undefined;
  const serviceIds: string[] = [];
  const categoryIds: string[] = [];

  const client = (value: PrismaClient | undefined): PrismaClient => {
    if (value === undefined) throw new Error('BA-09 PostgreSQL client is not initialized');
    return value;
  };

  const createNamedClient = (applicationName: string): PrismaClient => {
    const url = new URL(databaseUrl!);
    url.searchParams.set('application_name', applicationName.slice(0, 63));
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  };

  const catalog = (prisma: PrismaClient): ServiceCatalogService =>
    new ServiceCatalogService(
      prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
    );

  const createCategory = async (name: string) => {
    const category = await client(adminClient).serviceCategory.create({
      data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-${stamp}` },
    });
    categoryIds.push(category.id);
    return category;
  };

  const createService = async (categoryId: string) => {
    const service = await client(adminClient).service.create({
      data: {
        name: `BA-09 service ${stamp}`,
        slug: `ba09-service-${stamp}`,
        categoryId,
      },
    });
    serviceIds.push(service.id);
    return service;
  };

  beforeAll(() => {
    adminClient = createNamedClient(`ba09-admin-${stamp}`);
    serviceWriter = createNamedClient(`ba09-service-writer-${stamp}`);
    categoryWriter = createNamedClient(`ba09-category-writer-${stamp}`);
  });

  afterAll(async () => {
    const cleanup = client(adminClient);
    try {
      if (serviceIds.length > 0 || categoryIds.length > 0) {
        await cleanup.changeLog.deleteMany({
          where: { entityId: { in: [...serviceIds, ...categoryIds] } },
        });
      }
      if (serviceIds.length > 0) {
        await cleanup.service.deleteMany({ where: { id: { in: serviceIds } } });
      }
      if (categoryIds.length > 0) {
        await cleanup.serviceCategory.deleteMany({ where: { id: { in: categoryIds } } });
      }
    } finally {
      await Promise.all([
        adminClient?.$disconnect(),
        serviceWriter?.$disconnect(),
        categoryWriter?.$disconnect(),
      ]);
    }
  });

  it('commits one service write and one changelog for concurrent requests with the same ETag', async () => {
    const category = await createCategory(`BA-09 Service Category ${stamp}`);
    const service = await createService(category.id);
    const outcomes = await Promise.allSettled([
      catalog(client(serviceWriter)).update(
        service.id,
        { name: 'Service winner A', reason: 'writer A' },
        '"v1"',
      ),
      catalog(client(categoryWriter)).update(
        service.id,
        { name: 'Service winner B', reason: 'writer B' },
        '"v1"',
      ),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]).toMatchObject({ status: 'fulfilled', value: { revision: 2 } });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(OptimisticConcurrencyError);
    expect(rejected[0]?.reason).toMatchObject({
      code: 'OPTIMISTIC_STALE_WRITE',
      httpStatus: 412,
      currentEtag: '"v2"',
    });

    const persisted = await client(adminClient).service.findUniqueOrThrow({
      where: { id: service.id },
    });
    expect(persisted.revision).toBe(2);
    expect(persisted.name).toMatch(/^Service winner [AB]$/u);
    const serviceLogs = await client(adminClient).changeLog.findMany({
      where: { entityType: serviceChangeLogEntityType(), entityId: service.id },
    });
    expect(serviceLogs).toHaveLength(1);
    expect(serviceLogs[0]?.reason).toMatch(/^writer [AB]$/u);
  });

  it('keeps the category tree lock while CAS rejects a stale concurrent category update', async () => {
    const category = await createCategory(`BA-09 Category ${stamp}`);
    const outcomes = await Promise.allSettled([
      catalog(client(serviceWriter)).updateCategory(
        category.id,
        { name: 'Category winner A' },
        '"v1"',
      ),
      catalog(client(categoryWriter)).updateCategory(
        category.id,
        { name: 'Category winner B' },
        '"v1"',
      ),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]).toMatchObject({ status: 'fulfilled', value: { revision: 2 } });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(OptimisticConcurrencyError);
    expect(rejected[0]?.reason).toMatchObject({
      code: 'OPTIMISTIC_STALE_WRITE',
      httpStatus: 412,
      currentEtag: '"v2"',
    });

    const persisted = await client(adminClient).serviceCategory.findUniqueOrThrow({
      where: { id: category.id },
    });
    expect(persisted.revision).toBe(2);
    expect(persisted.name).toMatch(/^Category winner [AB]$/u);
    const categoryLogs = await client(adminClient).changeLog.findMany({
      where: { entityType: serviceCategoryChangeLogEntityType(), entityId: category.id },
    });
    expect(categoryLogs).toHaveLength(1);
  });
});
