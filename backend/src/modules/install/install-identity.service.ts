import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { installIdentityErrorCodes } from './install-identity.constants';
import { InstallIdentityError } from './install-identity.error';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { defaultReportsTimeZone } from '../settings/definitions/reports-settings';
import { installIdentityChangeReason } from './install-identity.constants';
import { mapInstallIdentityError } from './map-install-identity-error';
import { readInstallIdentityStatus } from './read-install-identity-status';
import { validateInstallIdentity } from './validate-install-identity';
import type {
  InstallIdentityInput,
  InstallIdentityPublicRecord,
  InstallIdentityStatus,
} from './install-identity.types';
import type { SettingValue } from '../settings/settings.types';

/**
 * Install wizard v2 (F2): writes the identity through the settings registry,
 * in one transaction with one change-log reason. The step never touches the
 * database directly, so the same validators (and the same audit trail) apply as
 * in Settings → Brending.
 */
@Injectable()
export class InstallIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async getStatus(): Promise<InstallIdentityStatus> {
    return this.execute(async () => ({
      identity: await readInstallIdentityStatus(this.settingsService),
    }));
  }

  async save(input: InstallIdentityInput): Promise<InstallIdentityPublicRecord> {
    return this.execute(async () => {
      const identity = validateInstallIdentity(input);
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallIdentityError(installIdentityErrorCodes.superAdminRequired);
      }
      await this.settingsService.setSettingValues(
        toSettingEntries(identity),
        {
          reason: installIdentityChangeReason,
          actorUserId: superAdmin.id,
        },
      );
      return readInstallIdentityStatus(this.settingsService);
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallIdentityError(error);
    }
  }
}

/**
 * Only the fields the operator actually filled are written: an untouched
 * "configure later" field must not overwrite what is already configured
 * (the same reason the step form is pre-filled from stored values).
 */
function toSettingEntries(
  identity: InstallIdentityInput,
): readonly { readonly key: string; readonly value: SettingValue }[] {
  const entries: { key: string; value: SettingValue }[] = [
    {
      key: settingKeys.publicBrandingOrganizationName,
      value: identity.organizationName,
    },
  ];
  if (identity.appName !== undefined) {
    entries.push({ key: settingKeys.publicBrandingAppName, value: identity.appName });
  }
  if (identity.tagline !== undefined) {
    entries.push({ key: settingKeys.publicBrandingTagline, value: identity.tagline });
  }
  if (identity.locale !== undefined) {
    entries.push({ key: settingKeys.privateI18nDefaultLocale, value: identity.locale });
  }
  if (identity.timeZone !== undefined) {
    entries.push({
      key: settingKeys.privateReportsTimeZone,
      value: identity.timeZone.length > 0 ? identity.timeZone : defaultReportsTimeZone,
    });
  }
  // Omitted means "configure later": an untouched logo is never overwritten.
  if (identity.logoDataUrl !== undefined) {
    entries.push({
      key: settingKeys.publicBrandingLogoDataUrl,
      value: identity.logoDataUrl,
    });
  }
  if (identity.supportEmail !== undefined) {
    entries.push({
      key: settingKeys.publicBrandingSupportEmail,
      value: identity.supportEmail,
    });
  }
  if (identity.supportUrl !== undefined) {
    entries.push({ key: settingKeys.publicBrandingSupportUrl, value: identity.supportUrl });
  }
  return entries;
}
