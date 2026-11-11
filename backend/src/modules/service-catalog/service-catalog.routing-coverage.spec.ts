import { BadRequestException } from '@nestjs/common';
import { RoutingError } from '../routing/routing.error';
import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';
import { ServiceCatalogService } from './service-catalog.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ServiceCatalogService routing coverage on activation', () => {
  const createHarness = (routingStub: {
    evaluateActivationCoverage: (
      serviceId: string,
    ) => Promise<'ROUTING_COVERAGE_MISSING' | null>;
  }) => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(
      memory.prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
      undefined,
      routingStub as never,
    );
    return { catalog, memory };
  };

  it('blocks DRAFT→ACTIVE when coverage is required and missing', async () => {
    const { catalog } = createHarness({
      evaluateActivationCoverage: async () => {
        throw new RoutingError('ROUTING_COVERAGE_MISSING');
      },
    });
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    const created = await catalog.create({
      name: 'VPN',
      slug: 'vpn-block',
      categoryId: category.id,
    });
    await expect(
      catalog.transitionLifecycle(created.id, { lifecycle: 'ACTIVE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      catalog.transitionLifecycle(created.id, { lifecycle: 'ACTIVE' }),
    ).rejects.toMatchObject({
      response: { code: 'ROUTING_COVERAGE_MISSING' },
    });
  });

  it('activates with warning when coverage is optional and missing', async () => {
    const { catalog, memory } = createHarness({
      evaluateActivationCoverage: async () => 'ROUTING_COVERAGE_MISSING',
    });
    const category = await catalog.createCategory({ name: 'IT', slug: 'it' });
    const created = await catalog.create({
      name: 'VPN',
      slug: 'vpn-warn',
      categoryId: category.id,
    });
    const now = new Date('2026-09-10T10:00:00.000Z');
    memory.seedFormVersion({
      id: 'form-vpn-warn',
      serviceId: created.id,
      version: 1,
      schema: { schemaVersion: 1, fields: [] },
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    const activated = await catalog.transitionLifecycle(created.id, {
      lifecycle: 'ACTIVE',
    });
    expect(activated.lifecycle).toBe('ACTIVE');
    expect(activated.warnings).toEqual(['ROUTING_COVERAGE_MISSING']);
  });
});
