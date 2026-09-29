import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { mapInstallSuperAdminError } from './map-install-super-admin-error';
import { mapInstallSuperAdminPublicRecord } from './map-install-super-admin-public-record';
import { seedInstallInternalEmailDomain } from './seed-install-internal-email-domain';
import type { InstallSettingsWriteTransaction } from './install-complete.types';
import type {
  CreateInstallSuperAdminInput,
  HashInstallSuperAdminPassword,
  InstallSuperAdminPublicRecord,
  InstallSuperAdminStatus,
} from './install-super-admin.types';

@Injectable()
export class InstallSuperAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<InstallSuperAdminStatus> {
    return this.execute(async () => {
      const existing = await findInstallSuperAdmin(this.prisma);
      return {
        superAdmin:
          existing === null
            ? null
            : mapInstallSuperAdminPublicRecord(existing),
      };
    });
  }

  async create(
    input: CreateInstallSuperAdminInput,
    hashPassword?: HashInstallSuperAdminPassword,
  ): Promise<InstallSuperAdminPublicRecord> {
    return this.execute(async () => {
      const created = await createInstallSuperAdmin(this.prisma, input, hashPassword);
      if ((this.prisma as { appSetting?: unknown }).appSetting !== undefined) {
        await seedInstallInternalEmailDomain(this.prisma as unknown as InstallSettingsWriteTransaction, created.email);
      }
      return created;
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallSuperAdminError(error);
    }
  }
}
