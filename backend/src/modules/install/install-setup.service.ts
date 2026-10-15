import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  createSetupDatabaseUnavailableException,
  createSetupRequiredException,
} from './create-setup-required-exception';
import { isInstallDatabaseUnavailableError } from './is-install-database-unavailable-error';
import { isInstallSetupComplete } from './is-install-setup-complete';
import { settingKeys } from '../settings/setting-keys';
import { readInstallProfile, readInstallStepProgress, toInstallStepStates } from './read-install-step-states';
import { resolveInstallNextStep } from './steps/resolve-install-next-step';
import type { InstallProfile } from './steps/install-step.types';
import type {
  InstallSetupStatus,
  InstallStepStatesRecord,
} from './install-setup.types';

@Injectable()
export class InstallSetupService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Install wizard v2 (F1): the step machine moved into the registry
   * (`steps/`), so this service only reads the state, asks
   * `resolveInstallNextStep` what comes next, and reports it.
   */
  async getStatus(): Promise<InstallSetupStatus> {
    if (await this.isCompleted()) {
      const profile = await this.readProfileSafely();
      return completedStatus(profile);
    }
    const { profile, progress } = await this.readStepProgress();
    const states = toInstallStepStates(profile, progress);
    return {
      isCompleted: false,
      nextStep: resolveInstallNextStep({ profile, states }),
      profile,
      steps: states,
    };
  }

  async isCompleted(): Promise<boolean> {
    try {
      const completedAt = await this.settingsService.getSetting(
        settingKeys.privateInstallCompletedAt,
      );
      return isInstallSetupComplete(completedAt);
    } catch (error) {
      if (isInstallDatabaseUnavailableError(error)) {
        throw createSetupDatabaseUnavailableException();
      }
      throw createSetupRequiredException();
    }
  }

  async readCompletedAt(): Promise<unknown> {
    return this.settingsService.getSetting(
      settingKeys.privateInstallCompletedAt,
    );
  }

  private async readStepProgress() {
    try {
      return await readInstallStepProgress(this.prisma, this.settingsService);
    } catch (error) {
      propagateDatabaseFailure(error);
      throw error;
    }
  }

  private async readProfileSafely(): Promise<InstallProfile | null> {
    try {
      return await readInstallProfile(this.settingsService);
    } catch {
      return null;
    }
  }
}

export function completedStatus(
  profile: InstallProfile | null = null,
): InstallSetupStatus {
  return {
    isCompleted: true,
    nextStep: 'complete',
    profile,
    steps: completedStepStates(),
  };
}

export function completedStepStates(): InstallStepStatesRecord {
  return {
    profile: { completed: true },
    superAdmin: { completed: true },
    identity: { completed: true },
    loginProvider: { completed: true },
    smtp: { completed: true },
    seed: { completed: true },
    team: { completed: true },
    addons: { completed: true },
  };
}

function propagateDatabaseFailure(error: unknown): void {
  if (isInstallDatabaseUnavailableError(error)) {
    throw createSetupDatabaseUnavailableException();
  }
}
