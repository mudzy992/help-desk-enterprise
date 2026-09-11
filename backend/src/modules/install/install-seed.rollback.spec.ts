import { defaultServiceLifecycleConfiguration } from '../service-catalog/service-catalog.constants';
import { createInstallSeedHarness } from './create-install-seed-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('InstallSeedService rollback', () => {
  it('rolls back created records when routing persist fails', async () => {
    const { service, memory } = await createInstallSeedHarness();
    memory.failNextRoutingCreate();
    await expect(service.seed()).rejects.toThrow('forced-routing-create-failure');
    expect(memory.countUnits()).toBe(0);
    expect(memory.countGroups()).toBe(0);
    expect(memory.countServices()).toBe(0);
    expect(memory.countRules()).toBe(0);
    const retried = await service.seed();
    expect(retried.isSeeded).toBe(true);
    expect(retried.created.routingRule).toBe(true);
  });

  it('does not persist seed records when lifecycle activation is disabled', async () => {
    const { service, memory } = await createInstallSeedHarness({
      lifecycle: {
        ...defaultServiceLifecycleConfiguration,
        enabled: false,
      },
    });
    await expect(service.seed()).rejects.toMatchObject({
      response: { code: 'LIFECYCLE_DISABLED' },
    });
    expect(memory.countUnits()).toBe(0);
    expect(memory.countGroups()).toBe(0);
    expect(memory.countServices()).toBe(0);
    expect(memory.countRules()).toBe(0);
  });
});
