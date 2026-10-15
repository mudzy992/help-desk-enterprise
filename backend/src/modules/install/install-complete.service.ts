import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { settingKeys } from '../settings/setting-keys';
import { SETTINGS_REGISTRY } from '../settings/settings.registry-token';
import type { SettingsRegistry } from '../settings/settings.types';
import { SettingsService } from '../settings/settings.service';
import {
  installCompleteConstants,
  installCompleteErrorCodes,
} from './install-complete.constants';
import { InstallCompleteError } from './install-complete.error';
import type { InstallCompletionPrisma } from './install-complete.types';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { isInstallSetupComplete } from './is-install-setup-complete';
import { mapInstallCompleteError } from './map-install-complete-error';
import { persistInstallCompletion } from './persist-install-completion';
import { completedStatus } from './install-setup.service';
import { InstallReadinessService } from './install-readiness.service';
import { readInstallProfile } from './read-install-step-states';
import { readMissingReadinessKeys } from './evaluate-install-readiness';
import type { InstallSetupStatus } from './install-setup.types';

@Injectable()
export class InstallCompleteService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
    private readonly settingsService: SettingsService,
    private readonly readinessService: InstallReadinessService,
  ) {}

  async onModuleInit(): Promise<void> {
    const completedAt = await this.readStoredCompletedAt();
    if (
      !isInstallSetupComplete(completedAt) ||
      typeof completedAt !== 'string'
    ) {
      return;
    }
    const actorUserId = await this.resolveActorUserId(true);
    if (actorUserId === null) {
      return;
    }
    await persistInstallCompletion(
      this.prisma as unknown as InstallCompletionPrisma,
      this.registry,
      {
        actorUserId,
        completedAt,
        reason: installCompleteConstants.changeLogReason,
      },
    );
  }

  async complete(): Promise<InstallSetupStatus> {
    return this.completeAt(new Date().toISOString());
  }

  async completeAt(completedAt: string): Promise<InstallSetupStatus> {
    return this.execute(async () => {
      const storedCompletedAt = await this.readStoredCompletedAt();
      const alreadyComplete = isInstallSetupComplete(storedCompletedAt);
      const actorUserId = await this.resolveActorUserId(alreadyComplete);
      if (actorUserId === null) {
        throw new InstallCompleteError(
          installCompleteErrorCodes.superAdminRequired,
        );
      }
      if (!alreadyComplete) {
        await this.assertReadyForTickets();
      }
      await persistInstallCompletion(
        this.prisma as unknown as InstallCompletionPrisma,
        this.registry,
        {
          actorUserId,
          completedAt,
          reason: installCompleteConstants.changeLogReason,
        },
      );
      return completedStatus(await readInstallProfile(this.settingsService));
    });
  }

  /**
   * Install wizard v2 (F0.7): the installation may only be finished when the
   * system can actually receive tickets — the same checks the wizard shows in
   * `GET /install/readiness` (F1 adds `profileSteps`).
   */
  private async assertReadyForTickets(): Promise<void> {
    const readiness = await this.readinessService.check();
    if (readiness.isReady) {
      return;
    }
    throw new InstallCompleteError(
      installCompleteErrorCodes.notReady,
      installCompleteErrorCodes.notReady,
      readMissingReadinessKeys(readiness.checks),
    );
  }

  private async readStoredCompletedAt(): Promise<unknown> {
    const stored = await this.prisma.appSetting.findUnique({
      where: { key: settingKeys.privateInstallCompletedAt },
      select: { value: true },
    });
    return stored?.value;
  }

  private async resolveActorUserId(
    alreadyComplete: boolean,
  ): Promise<string | null> {
    const superAdmin = await findInstallSuperAdmin(this.prisma);
    if (superAdmin !== null) {
      return superAdmin.id;
    }
    if (!alreadyComplete) {
      return null;
    }
    const stored = await this.prisma.appSetting.findUnique({
      where: { key: settingKeys.privateInstallCompletedByUserId },
      select: { value: true },
    });
    if (typeof stored?.value === 'string' && stored.value.trim().length > 0) {
      return stored.value.trim();
    }
    return null;
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallCompleteError(error);
    }
  }
}
