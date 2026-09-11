import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import {
  installLoginProviderConstants,
  installLoginProviderErrorCodes,
} from './install-login-provider.constants';
import { InstallLoginProviderError } from './install-login-provider.error';
import type {
  InstallLoginProviderPublicRecord,
  InstallLoginProviderStatus,
  SaveInstallLoginProviderInput,
} from './install-login-provider.types';
import { mapInstallLoginProviderError } from './map-install-login-provider-error';
import { persistInstallLoginProvider } from './persist-install-login-provider';
import {
  readInstallLoginProviderStatus,
  readStoredInstallLoginProviderSecrets,
} from './read-install-login-provider-status';
import { validateInstallLoginProvider } from './validate-install-login-provider';

@Injectable()
export class InstallLoginProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async getStatus(): Promise<InstallLoginProviderStatus> {
    return this.execute(async () => ({
      loginProvider: await readInstallLoginProviderStatus(this.settingsService),
    }));
  }

  async save(
    input: SaveInstallLoginProviderInput,
  ): Promise<InstallLoginProviderPublicRecord> {
    return this.execute(async () => {
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallLoginProviderError(
          installLoginProviderErrorCodes.superAdminRequired,
        );
      }
      const stored = await readStoredInstallLoginProviderSecrets(
        this.settingsService,
      );
      const validated = validateInstallLoginProvider(input, stored);
      await persistInstallLoginProvider(this.settingsService, validated, {
        reason: installLoginProviderConstants.changeLogReason,
        actorUserId: superAdmin.id,
      });
      return readInstallLoginProviderStatus(this.settingsService);
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallLoginProviderError(error);
    }
  }
}
