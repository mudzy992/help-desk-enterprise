import type { PrismaService } from '../../common/prisma/prisma.service';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { RoutingConfigurationLoader } from '../routing/routing-configuration.loader';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { defaultServiceLifecycleConfiguration } from '../service-catalog/service-catalog.constants';
import type { ServiceLifecycleConfiguration } from '../service-catalog/service-catalog.types';
import { ServiceLifecycleConfigurationLoader } from '../service-catalog/service-lifecycle-configuration.loader';
import { createInMemoryInstallSeedPrisma } from './create-in-memory-install-seed-prisma';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { InstallSeedService } from './install-seed.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

export const seedNow = new Date('2026-09-11T10:00:00.000Z');

export async function createInstallSeedHarness(input?: {
  readonly withSuperAdmin?: boolean;
  readonly lifecycle?: ServiceLifecycleConfiguration;
}) {
  const memory = createInMemoryInstallSeedPrisma();
  const service = new InstallSeedService(
    memory.prisma as unknown as PrismaService,
    {
      load: async () => input?.lifecycle ?? defaultServiceLifecycleConfiguration,
    } as unknown as ServiceLifecycleConfigurationLoader,
    {
      load: async () => defaultRoutingConfiguration,
    } as unknown as RoutingConfigurationLoader,
  );
  if (input?.withSuperAdmin !== false) {
    await createInstallSuperAdmin(
      memory.prisma as unknown as PrismaService,
      {
        email: 'admin@example.com',
        displayName: 'Super Admin',
        password: 'correct-horse-battery',
      },
      (value) => hashLocalPassword(value, 4),
    );
  }
  return { memory, service };
}
