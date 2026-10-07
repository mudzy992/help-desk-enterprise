import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { readInstallAddonsStatus } from './read-install-addons-status';
import {
  isLoginProviderSaved,
  readInstallLoginProviderStatus,
} from './read-install-login-provider-status';
import { readInstallSeedStatus } from './read-install-seed-status';
import { readInstallSmtpEnvPrefill } from './read-install-smtp-env-prefill';
import { readInstallSmtpStatus } from './read-install-smtp-status';
import { isInstallSetupComplete } from './is-install-setup-complete';
import {
  createSetupDatabaseUnavailableException,
  createSetupRequiredException,
} from './create-setup-required-exception';
import { isInstallDatabaseUnavailableError } from './is-install-database-unavailable-error';
import type { InstallSetupStatus, InstallWizardStep } from './install-setup.types';

@Injectable()
export class InstallSetupService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async getStatus(): Promise<InstallSetupStatus> {
    const isCompleted = await this.isCompleted();
    if (isCompleted) {
      return completedStatus();
    }
    const [superAdmin, loginProvider, smtp, seed, addons] = await Promise.all([
      findInstallSuperAdmin(this.prisma).catch(propagateDatabaseFailure),
      this.readLoginProviderStatus().catch(propagateDatabaseFailure),
      this.readSmtpStatus().catch(propagateDatabaseFailure),
      readInstallSeedStatus(this.prisma).catch(propagateDatabaseFailure),
      readInstallAddonsStatus(this.settingsService).catch(propagateDatabaseFailure),
    ]);
    const steps = {
      superAdmin: { completed: superAdmin !== null },
      loginProvider: { completed: isLoginProviderSaved(loginProvider) },
      smtp: { completed: smtp.isConfigured },
      seed: { completed: seed.isSeeded },
      addons: { completed: true },
    };
    return {
      isCompleted: false,
      nextStep: resolveNextInstallStep(steps),
      steps,
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

  private async readLoginProviderStatus() {
    return readInstallLoginProviderStatus(this.settingsService);
  }

  private async readSmtpStatus() {
    return readInstallSmtpStatus(
      this.settingsService,
      readInstallSmtpEnvPrefill(),
    );
  }
}

function completedStatus(): InstallSetupStatus {
  return {
    isCompleted: true,
    nextStep: 'complete',
    steps: {
      superAdmin: { completed: true },
      loginProvider: { completed: true },
      smtp: { completed: true },
      seed: { completed: true },
      addons: { completed: true },
    },
  };
}

function resolveNextInstallStep(steps: InstallSetupStatus['steps']): InstallWizardStep {
  if (!steps.superAdmin.completed) {
    return 'superAdmin';
  }
  if (!steps.loginProvider.completed) {
    return 'loginProvider';
  }
  if (!steps.smtp.completed) {
    return 'smtp';
  }
  if (!steps.seed.completed) {
    return 'seed';
  }
  if (!steps.addons.completed) {
    return 'addons';
  }
  return 'complete';
}

function propagateDatabaseFailure(error: unknown): never {
  if (isInstallDatabaseUnavailableError(error)) {
    throw createSetupDatabaseUnavailableException();
  }
  throw error;
}
