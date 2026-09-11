import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import {
  installSmtpConstants,
  installSmtpErrorCodes,
} from './install-smtp.constants';
import { InstallSmtpError } from './install-smtp.error';
import type {
  InstallSmtpPublicRecord,
  InstallSmtpStatus,
  SaveInstallSmtpInput,
} from './install-smtp.types';
import { mapInstallSmtpError } from './map-install-smtp-error';
import { persistInstallSmtp } from './persist-install-smtp';
import { readInstallSmtpEnvPrefill } from './read-install-smtp-env-prefill';
import {
  readInstallSmtpStatus,
  readStoredInstallSmtp,
} from './read-install-smtp-status';
import { validateInstallSmtp } from './validate-install-smtp';

@Injectable()
export class InstallSmtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async getStatus(): Promise<InstallSmtpStatus> {
    return this.execute(async () => ({
      smtp: await readInstallSmtpStatus(
        this.settingsService,
        readInstallSmtpEnvPrefill(),
      ),
    }));
  }

  async save(input: SaveInstallSmtpInput): Promise<InstallSmtpPublicRecord> {
    return this.execute(async () => {
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallSmtpError(installSmtpErrorCodes.superAdminRequired);
      }
      const stored = await readStoredInstallSmtp(this.settingsService);
      const validated = validateInstallSmtp(
        input,
        stored,
        readInstallSmtpEnvPrefill(),
      );
      await persistInstallSmtp(this.settingsService, validated, {
        reason: installSmtpConstants.changeLogReason,
        actorUserId: superAdmin.id,
      });
      return readInstallSmtpStatus(
        this.settingsService,
        readInstallSmtpEnvPrefill(),
      );
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallSmtpError(error);
    }
  }
}
