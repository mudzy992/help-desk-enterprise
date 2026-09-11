import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { settingKeys } from '../settings/setting-keys';
import { SETTINGS_REGISTRY } from '../settings/settings.registry-token';
import type { SettingsRegistry } from '../settings/settings.types';
import {
  installCompleteConstants,
  installCompleteErrorCodes,
} from './install-complete.constants';
import { InstallCompleteError } from './install-complete.error';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { isInstallSetupComplete } from './is-install-setup-complete';
import { mapInstallCompleteError } from './map-install-complete-error';
import {
  persistInstallCompletion,
  type InstallCompletionPrisma,
} from './persist-install-completion';
import type { InstallSetupStatus } from './install-setup.types';

@Injectable()
export class InstallCompleteService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
  ) {}

  async complete(): Promise<InstallSetupStatus> {
    return this.completeAt(new Date().toISOString());
  }

  async completeAt(completedAt: string): Promise<InstallSetupStatus> {
    return this.execute(async () => {
      const stored = await this.prisma.appSetting.findUnique({
        where: { key: settingKeys.privateInstallCompletedAt },
        select: { value: true },
      });
      if (isInstallSetupComplete(stored?.value)) {
        return { isCompleted: true };
      }
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallCompleteError(
          installCompleteErrorCodes.superAdminRequired,
        );
      }
      await persistInstallCompletion(
        this.prisma as unknown as InstallCompletionPrisma,
        this.registry,
        {
          actorUserId: superAdmin.id,
          completedAt,
          reason: installCompleteConstants.changeLogReason,
        },
      );
      return { isCompleted: true };
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallCompleteError(error);
    }
  }
}
