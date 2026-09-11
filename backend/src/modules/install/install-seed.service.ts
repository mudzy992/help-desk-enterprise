import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { installSeedErrorCodes } from './install-seed.constants';
import { InstallSeedError } from './install-seed.error';
import type { InstallSeedResult, InstallSeedStatus } from './install-seed.types';
import { mapInstallSeedError } from './map-install-seed-error';
import { readInstallSeedStatus } from './read-install-seed-status';
import { seedInstallMinimum } from './seed-install-minimum';
import { RoutingConfigurationLoader } from '../routing/routing-configuration.loader';
import { ServiceLifecycleConfigurationLoader } from '../service-catalog/service-lifecycle-configuration.loader';

@Injectable()
export class InstallSeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleConfigurationLoader: Pick<
      ServiceLifecycleConfigurationLoader,
      'load'
    >,
    private readonly routingConfigurationLoader: Pick<
      RoutingConfigurationLoader,
      'load'
    >,
  ) {}

  async getStatus(): Promise<InstallSeedStatus> {
    return this.execute(async () => ({
      seed: await readInstallSeedStatus(this.prisma),
    }));
  }

  async seed(): Promise<InstallSeedResult> {
    return this.execute(async () => {
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallSeedError(installSeedErrorCodes.superAdminRequired);
      }
      return seedInstallMinimum(this.prisma, {
        actorUserId: superAdmin.id,
        lifecycle: await this.lifecycleConfigurationLoader.load(),
        routing: await this.routingConfigurationLoader.load(),
      });
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallSeedError(error);
    }
  }
}
