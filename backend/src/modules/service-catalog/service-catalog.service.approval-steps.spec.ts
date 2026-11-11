import { createInMemoryServiceCatalogPrisma } from './create-in-memory-service-catalog-prisma';
import { ServiceCatalogService } from './service-catalog.service';
import { defaultServiceLifecycleConfiguration } from './service-catalog.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createHarness(approvalsConfigurationLoader?: { load: () => Promise<unknown> }) {
  const memory = createInMemoryServiceCatalogPrisma();
  const service = new ServiceCatalogService(
    memory.prisma as never,
    { load: async () => defaultServiceLifecycleConfiguration } as never,
    undefined,
    undefined,
    approvalsConfigurationLoader as never,
  );
  return { memory, service };
}

describe('ServiceCatalogService approvalSteps (list/getById)', () => {
  it('falls back to the plain requiresApproval flag without a loader', async () => {
    const { service } = createHarness(undefined);
    const category = await service.createCategory({ name: 'IT', slug: 'it' });
    const created = await service.create({
      name: 'Access request',
      slug: 'access-request',
      categoryId: category.id,
      classification: 'INTERNAL',
      requiresApproval: true,
    });
    expect(created.approvalSteps).toBe(1);
    const listed = await service.list();
    expect(listed.find((item) => item.id === created.id)?.approvalSteps).toBe(1);
    const fetched = await service.getById(created.id);
    expect(fetched.approvalSteps).toBe(1);
  });

  it('list() and getById() both use the live approvals configuration when a loader is wired', async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    let overlayEnabled = false;
    const service = new ServiceCatalogService(
      memory.prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
      undefined,
      undefined,
      {
        load: async () => ({
          enabled: true,
          requiredByService: overlayEnabled ? { [serviceId]: true } : {},
          defaultApproverRole: 'ADMIN',
          allowRequesterManager: false,
        }),
      } as never,
    );
    const category = await service.createCategory({ name: 'IT', slug: 'it' });
    const created = await service.create({
      name: 'Password reset',
      slug: 'password-reset',
      categoryId: category.id,
      classification: 'INTERNAL',
    });
    const serviceId = created.id;
    expect((await service.getById(serviceId)).approvalSteps).toBe(0);
    overlayEnabled = true;
    expect((await service.getById(serviceId)).approvalSteps).toBe(1);
    expect(
      (await service.list()).find((item) => item.id === serviceId)?.approvalSteps,
    ).toBe(1);
  });
});
