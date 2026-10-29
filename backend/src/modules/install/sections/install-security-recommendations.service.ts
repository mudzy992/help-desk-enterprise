import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SETTINGS_REGISTRY } from '../../settings/settings.registry-token';
import { SettingsService } from '../../settings/settings.service';
import type { SettingsMutationInput, SettingsRegistry } from '../../settings/settings.types';
import { findInstallSuperAdmin } from '../find-install-super-admin';
import { persistInstallMarker } from '../persist-install-marker';
import { resolveInstallStepSavedKey } from '../steps/install-step.registry';
import {
  installSettingsSectionConstants,
  installSettingsSectionErrorCodes,
} from './install-settings-section.constants';
import { InstallSettingsSectionError } from './install-settings-section.error';
import { mapInstallSettingsSectionError } from './map-install-settings-section-error';
import { installSecurityRecommendationWrites } from './install-security-recommendations';
import type { InstallSecurityRecommendationsStatus } from './install-security-recommendations.types';
import { readInstallSecurityRecommendations } from './read-install-security-recommendations';

/**
 * Install wizard v2 (F5) + owner decision 7: the One „apply“ action of the
 * security panel. It is deliberately not a section — a section edits what the
 * operator typed, this writes a fixed, reviewed list — but it uses exactly the
 * same substrate (`SettingsService`, the change log, the cache invalidation) and
 * refuses the same way, so there is no second mechanism to audit.
 */
@Injectable()
export class InstallSecurityRecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
  ) {}

  getStatus(): Promise<InstallSecurityRecommendationsStatus> {
    return this.execute(() => readInstallSecurityRecommendations(this.settingsService));
  }

  apply(): Promise<InstallSecurityRecommendationsStatus> {
    return this.execute(async () => {
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallSettingsSectionError(installSettingsSectionErrorCodes.superAdminRequired);
      }
      const mutation: SettingsMutationInput = {
        reason: installSettingsSectionConstants.changeLogReason,
        actorUserId: superAdmin.id,
      };
      await this.settingsService.setSettingValues(installSecurityRecommendationWrites, mutation);
      await persistInstallMarker(this.prisma, this.registry, {
        key: resolveInstallStepSavedKey('securityRecommendations'),
        value: true,
        actorUserId: superAdmin.id,
        reason: installSettingsSectionConstants.changeLogReason,
      });
      return readInstallSecurityRecommendations(this.settingsService);
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallSettingsSectionError(error);
    }
  }
}
