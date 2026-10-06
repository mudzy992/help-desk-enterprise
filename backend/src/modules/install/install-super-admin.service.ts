import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountSecurityPolicyLoader } from '../authentication/security/account-security-policy.loader';
import type { PasswordPolicy } from '../authentication/security/password-policy';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { mapInstallSuperAdminError } from './map-install-super-admin-error';
import { mapInstallSuperAdminPublicRecord } from './map-install-super-admin-public-record';
import {
  describeInstallPasswordPolicy,
  installSuperAdminDefaultPasswordPolicy,
  toInstallPasswordPolicy,
} from './install-super-admin-password-policy';
import type { InstallPasswordPolicyPublic } from './install-super-admin-password-policy';
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
  constructor(
    private readonly prisma: PrismaService,
    // Paket 5.1 (M1 #1): the founder password obeys the account-security
    // policy. Optional so unit tests can build the service without settings;
    // the default policy is then used (same rules, no stored rows needed).
    @Optional()
    private readonly accountSecurityPolicyLoader: AccountSecurityPolicyLoader | null = null,
  ) {}

  /** Rules the wizard shows next to the password field (never values/secrets). */
  async getPasswordPolicy(): Promise<InstallPasswordPolicyPublic> {
    return describeInstallPasswordPolicy(await this.resolvePasswordPolicy());
  }

  private async resolvePasswordPolicy(): Promise<PasswordPolicy> {
    if (this.accountSecurityPolicyLoader === null) {
      return installSuperAdminDefaultPasswordPolicy;
    }
    try {
      return toInstallPasswordPolicy(
        await this.accountSecurityPolicyLoader.load(),
      );
    } catch {
      // Installation must not fail because settings are unreadable — the
      // fallback mirrors the shipped defaults.
      return installSuperAdminDefaultPasswordPolicy;
    }
  }

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
      const policy = await this.resolvePasswordPolicy();
      const created = await createInstallSuperAdmin(
        this.prisma,
        input,
        hashPassword,
        policy,
      );
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
