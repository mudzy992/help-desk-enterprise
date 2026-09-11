import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RoutingConfigurationLoader } from '../routing/routing-configuration.loader';
import { ServiceFormsConfigurationLoader } from '../service-catalog/service-forms-configuration.loader';
import { ServiceLifecycleConfigurationLoader } from '../service-catalog/service-lifecycle-configuration.loader';
import { createInstallSeedHarness } from './create-install-seed-harness';
import { installSeedConstants } from './install-seed.constants';
import { InstallSeedService } from './install-seed.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('InstallSeedService', () => {
  it('resolves concrete configuration loaders through Nest DI', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InstallSeedService,
        { provide: PrismaService, useValue: {} },
        {
          provide: ServiceLifecycleConfigurationLoader,
          useValue: { load: async () => undefined },
        },
        {
          provide: RoutingConfigurationLoader,
          useValue: { load: async () => undefined },
        },
        {
          provide: ServiceFormsConfigurationLoader,
          useValue: { load: async () => undefined },
        },
      ],
    }).compile();
    expect(moduleRef.get(InstallSeedService)).toBeInstanceOf(InstallSeedService);
  });

  it('seeds the minimum OU, fallback group, service, and routing on an empty database', async () => {
    const { service } = await createInstallSeedHarness();
    const seeded = await service.seed();
    expect(seeded.isSeeded).toBe(true);
    expect(seeded.created).toEqual({
      organizationalUnit: true,
      fallbackGroup: true,
      serviceCategory: true,
      service: true,
      serviceFormVersion: true,
      routingRule: true,
    });
    expect(seeded.organizationalUnit).toMatchObject({
      name: installSeedConstants.organizationalUnitName,
      ouPath: `/${installSeedConstants.organizationalUnitName}`,
    });
    expect(seeded.fallbackGroup).toMatchObject({
      name: installSeedConstants.fallbackGroupName,
      key: installSeedConstants.fallbackGroupKey,
      isFallback: true,
    });
    expect(seeded.service).toMatchObject({
      name: installSeedConstants.serviceName,
      slug: installSeedConstants.serviceSlug,
      lifecycle: 'ACTIVE',
    });
    expect(seeded.service?.activeFormVersionRef).toEqual(expect.any(String));
    expect(seeded.routingRule).toMatchObject({
      originUnitId: seeded.organizationalUnit?.id,
      serviceId: seeded.service?.id,
      groupId: seeded.fallbackGroup?.id,
    });
    expect(seeded.resolution).toMatchObject({
      outcome: 'EXACT',
      groupId: seeded.fallbackGroup?.id,
      fallbackDepth: 0,
    });
  });

  it('is idempotent on repeated execution', async () => {
    const { service, memory } = await createInstallSeedHarness();
    const first = await service.seed();
    const second = await service.seed();
    expect(second.created).toEqual({
      organizationalUnit: false,
      fallbackGroup: false,
      serviceCategory: false,
      service: false,
      serviceFormVersion: false,
      routingRule: false,
    });
    expect(second.organizationalUnit?.id).toBe(first.organizationalUnit?.id);
    expect(second.fallbackGroup?.id).toBe(first.fallbackGroup?.id);
    expect(second.service?.id).toBe(first.service?.id);
    expect(second.routingRule?.id).toBe(first.routingRule?.id);
    expect(memory.countUnits()).toBe(1);
    expect(memory.countGroups()).toBe(1);
    expect(memory.countServices()).toBe(1);
    expect(memory.countRules()).toBe(1);
    expect(memory.countFormVersions()).toBe(1);
  });

  it('returns seeded status after a successful seed', async () => {
    const { service } = await createInstallSeedHarness();
    await service.seed();
    await expect(service.getStatus()).resolves.toMatchObject({
      seed: { isSeeded: true },
    });
  });

  it('rejects seed before the SuperAdmin exists', async () => {
    const { service, memory } = await createInstallSeedHarness({
      withSuperAdmin: false,
    });
    await expect(service.seed()).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
    expect(memory.countUnits()).toBe(0);
    expect(memory.countGroups()).toBe(0);
    expect(memory.countServices()).toBe(0);
    expect(memory.countRules()).toBe(0);
  });
});
