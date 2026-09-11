import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import {
  installAddonsConstants,
  installAddonsErrorCodes,
} from './install-addons.constants';
import { InstallAddonsError } from './install-addons.error';
import type {
  InstallAddonsPublicRecord,
  InstallAddonsStatus,
  SaveInstallAddonsInput,
} from './install-addons.types';
import { mapInstallAddonsError } from './map-install-addons-error';
import {
  persistInstallAddons,
  readSmtpEnabledForAddons,
  readStoredInstallAddons,
} from './persist-install-addons';
import { readInstallAddonsStatus } from './read-install-addons-status';
import { resolveInstallAddonsState } from './resolve-install-addons-state';
import { validateInstallAddons } from './validate-install-addons';

@Injectable()
export class InstallAddonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async getStatus(): Promise<InstallAddonsStatus> {
    return this.execute(async () => ({
      addons: await readInstallAddonsStatus(this.settingsService),
    }));
  }

  async save(input: SaveInstallAddonsInput): Promise<InstallAddonsPublicRecord> {
    return this.execute(async () => {
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallAddonsError(
          installAddonsErrorCodes.superAdminRequired,
        );
      }
      const validated = validateInstallAddons(input);
      const values = resolveInstallAddonsState({
        smtpEnabled: await readSmtpEnabledForAddons(this.settingsService),
        stored: await readStoredInstallAddons(this.settingsService),
        requested: validated.addons,
      });
      await persistInstallAddons(this.settingsService, values, {
        reason: installAddonsConstants.changeLogReason,
        actorUserId: superAdmin.id,
      });
      return readInstallAddonsStatus(this.settingsService);
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallAddonsError(error);
    }
  }
}
