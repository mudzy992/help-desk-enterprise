import { Injectable } from '@nestjs/common';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { isInstallSetupComplete } from './is-install-setup-complete';
import type { InstallSetupStatus } from './install-setup.types';

@Injectable()
export class InstallSetupService {
  constructor(private readonly settingsService: SettingsService) {}

  async getStatus(): Promise<InstallSetupStatus> {
    return { isCompleted: await this.isCompleted() };
  }

  async isCompleted(): Promise<boolean> {
    try {
      const completedAt = await this.settingsService.getSetting(
        settingKeys.privateInstallCompletedAt,
      );
      return isInstallSetupComplete(completedAt);
    } catch {
      return false;
    }
  }

  async readCompletedAt(): Promise<unknown> {
    return this.settingsService.getSetting(
      settingKeys.privateInstallCompletedAt,
    );
  }
}
