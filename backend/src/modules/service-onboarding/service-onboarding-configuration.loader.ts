import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import {
  onboardingSettingKeys,
  parseServiceOnboardingConfiguration,
} from './parse-service-onboarding-configuration';
import { ServiceOnboardingError } from './service-onboarding.error';
import type { ServiceOnboardingConfiguration } from './service-onboarding.types';

@Injectable()
export class ServiceOnboardingConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ServiceOnboardingConfiguration> {
    try {
      return parseServiceOnboardingConfiguration({
        enabled: await this.settingsService.getSetting(
          onboardingSettingKeys.enabled,
        ),
        requireValidationBeforeActivate: await this.settingsService.getSetting(
          onboardingSettingKeys.requireValidationBeforeActivate,
        ),
        autoFillRoutingEnabled: await this.settingsService.getSetting(
          onboardingSettingKeys.autoFillRoutingEnabled,
        ),
        autoFillRoutingRequireConfirm: await this.settingsService.getSetting(
          onboardingSettingKeys.autoFillRoutingRequireConfirm,
        ),
      });
    } catch (error) {
      if (error instanceof ServiceOnboardingError) {
        throw error;
      }
      throw new ServiceOnboardingError('UNAVAILABLE');
    }
  }
}
