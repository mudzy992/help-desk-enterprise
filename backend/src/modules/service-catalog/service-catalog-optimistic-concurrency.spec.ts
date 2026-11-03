import { OptimisticConcurrencyError } from '../../common/optimistic-concurrency/optimistic-concurrency.error';
import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import {
  serviceCategoryChangeLogEntityType,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import { ServiceCatalogService } from './service-catalog.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('service catalog optimistic concurrency', () => {
  const createHarness = () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(
      memory.prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
    );
    return { catalog, memory };
  };

  it('requires a valid If-Match for service metadata and leaves no write or audit on failure', async () => {
    const { catalog, memory } = createHarness();
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    const service = await catalog.create({
      name: 'VPN',
      slug: 'vpn',
      categoryId: category.id,
    });
    const beforeLogs = memory.changeLogs.length;

    await expect(
      catalog.update(service.id, { name: 'Changed' }, undefined),
    ).rejects.toMatchObject({
      code: 'OPTIMISTIC_PRECONDITION_REQUIRED',
      httpStatus: 428,
    });
    await expect(
      catalog.update(service.id, { name: 'Changed' }, '*'),
    ).rejects.toMatchObject({
      code: 'OPTIMISTIC_IF_MATCH_INVALID',
      httpStatus: 400,
    });
    await expect(
      catalog.update(service.id, { name: 'Changed' }, '"v2"'),
    ).rejects.toMatchObject({
      code: 'OPTIMISTIC_STALE_WRITE',
      httpStatus: 412,
      currentEtag: '"v1"',
    });

    await expect(catalog.getById(service.id)).resolves.toMatchObject({
      name: 'VPN',
      revision: 1,
    });
    expect(memory.changeLogs).toHaveLength(beforeLogs);
  });

  it('allows exactly one service update for concurrent requests with the same ETag', async () => {
    const { catalog, memory } = createHarness();
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    const service = await catalog.create({
      name: 'VPN',
      slug: 'vpn',
      categoryId: category.id,
    });

    const outcomes = await Promise.allSettled([
      catalog.update(service.id, { name: 'VPN A', reason: 'writer A' }, '"v1"'),
      catalog.update(service.id, { name: 'VPN B', reason: 'writer B' }, '"v1"'),
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
    await expect(catalog.getById(service.id)).resolves.toMatchObject({
      name: expect.stringMatching(/^VPN [AB]$/u),
      revision: 2,
    });
    expect(
      memory.changeLogs.filter(
        (entry) =>
          entry.entityType === serviceChangeLogEntityType() &&
          entry.entityId === service.id &&
          entry.reason !== 'create',
      ),
    ).toHaveLength(1);
  });

  it('keeps category CAS, hierarchy validation, and its audit in one mutation', async () => {
    const { catalog, memory } = createHarness();
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    const beforeLogs = memory.changeLogs.length;

    await expect(
      catalog.updateCategory(category.id, { name: 'Changed' }, undefined),
    ).rejects.toMatchObject({
      code: 'OPTIMISTIC_PRECONDITION_REQUIRED',
      httpStatus: 428,
    });
    await expect(
      catalog.updateCategory(category.id, { name: 'Changed' }, 'W/"v1"'),
    ).rejects.toMatchObject({
      code: 'OPTIMISTIC_IF_MATCH_INVALID',
      httpStatus: 400,
    });
    expect(memory.changeLogs).toHaveLength(beforeLogs);

    const outcomes = await Promise.allSettled([
      catalog.updateCategory(category.id, { name: 'IT A' }, '"v1"'),
      catalog.updateCategory(category.id, { name: 'IT B' }, '"v1"'),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(rejected?.reason).toMatchObject({
      code: 'OPTIMISTIC_STALE_WRITE',
      httpStatus: 412,
      currentEtag: '"v2"',
    });
    await expect(catalog.getCategory(category.id)).resolves.toMatchObject({
      name: expect.stringMatching(/^IT [AB]$/u),
      revision: 2,
    });
    expect(
      memory.changeLogs.filter(
        (entry) =>
          entry.entityType === serviceCategoryChangeLogEntityType() &&
          entry.entityId === category.id &&
          entry.reason !== 'create',
      ),
    ).toHaveLength(1);
  });
});
