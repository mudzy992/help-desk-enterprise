import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { defaultDirectoryUserFilter } from '../../settings/definitions/directory-ldaps-settings';
import { DirectorySyncError } from '../directory-sync.error';
import { parseDistinguishedName } from './distinguished-name';
import { readCaCertificate } from './ldap-directory-client';
import { ldapsDefaults, type LdapsSyncConfiguration } from './ldaps-directory.types';
import { parseOrganizationalUnitMappingOverrides } from './resolve-user-organizational-unit';

/**
 * Paket 1.8 (A3): everything the LDAPS provider and the full sync need, read
 * tolerantly (a broken optional value falls back to its default). The bind
 * password never leaves this object and is never logged.
 */
@Injectable()
export class LdapsSyncConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<LdapsSyncConfiguration> {
    const get = (key: string) => this.settingsService.getSetting(key).catch(() => undefined);
    const secret = (key: string) =>
      this.settingsService.getSecretForInternalUse(key).catch(() => undefined);
    const [
      source, enabled, strategy, urlsCsv, bindDn, bindPassword, usersBaseDn, groupsBaseDn,
      pageSize, userFilter, retryBackoff, cooldown, maxDeactivation, scheduleCron,
      ouStrategy, overrides, roleSource, adminGroupDn, agentGroupDn,
    ] = await Promise.all([
      get(settingKeys.privateAuthAdReadSource),
      get(settingKeys.privateAuthAdReadEnabled),
      get(settingKeys.privateAuthAdReadStrategy),
      get(settingKeys.privateAuthAdLdapsUrlsCsv),
      secret(settingKeys.privateAuthAdBindDn),
      secret(settingKeys.privateAuthAdBindPassword),
      get(settingKeys.privateAuthAdReadUsersBaseDn),
      get(settingKeys.privateAuthAdReadGroupsBaseDn),
      get(settingKeys.privateAuthAdReadPageSize),
      get(settingKeys.privateAuthAdReadUserFilter),
      get(settingKeys.privateAuthAdReadRetryBackoffMinutes),
      get(settingKeys.privateAuthAdReadSyncCooldownMinutes),
      get(settingKeys.privateAuthAdReadMaxDeactivationPercent),
      get(settingKeys.privateAuthAdReadScheduleCron),
      get(settingKeys.privateAuthOuMappingStrategy),
      secret(settingKeys.privateAuthOuMappingOverridesJson),
      get(settingKeys.privateAuthRoleSource),
      get(settingKeys.privateAuthAdRoleGroupDnAdmin),
      get(settingKeys.privateAuthAdRoleGroupDnAgent),
    ]);
    let caCertificatePem: string | null = null;
    try {
      caCertificatePem = readCaCertificate(
        process.env.AD_LDAPS_CA_CERT_PATH,
        process.env.AD_LDAPS_CA_CERT_BASE64,
      );
    } catch {
      throw new DirectorySyncError('DIRECTORY_NOT_CONFIGURED', 'CA certificate unreadable', {
        field: process.env.AD_LDAPS_CA_CERT_PATH?.trim()
          ? 'AD_LDAPS_CA_CERT_PATH'
          : 'AD_LDAPS_CA_CERT_BASE64',
      });
    }
    return {
      source: source === 'ldaps' ? 'ldaps' : 'manual_catalog',
      enabled: enabled === true,
      strategy: strategy === 'scheduled' ? 'scheduled' : 'manual_only',
      connection: {
        urls: text(urlsCsv)
          .split(',')
          .map((url) => url.trim())
          .filter((url) => /^ldaps:\/\/[^\s/]+(:\d+)?\/?$/i.test(url)),
        bindDn: text(bindDn),
        bindPassword: typeof bindPassword === 'string' ? bindPassword : '',
        caCertificatePem,
        connectTimeoutMilliseconds: ldapsDefaults.connectTimeoutMilliseconds,
        operationTimeoutMilliseconds: ldapsDefaults.operationTimeoutMilliseconds,
      },
      usersBaseDn: text(usersBaseDn),
      groupsBaseDn: text(groupsBaseDn),
      pageSize: integer(pageSize, 500),
      userFilter: text(userFilter) || defaultDirectoryUserFilter,
      retryBackoffMilliseconds: integer(retryBackoff, 3) * 60_000,
      syncCooldownMilliseconds: integer(cooldown, 15) * 60_000,
      maxDeactivationPercent: integer(maxDeactivation, 10),
      scheduleCron: text(scheduleCron) || '30 2 * * *',
      ouMappingStrategy: ouStrategy === 'by_company_department' ? 'by_company_department' : 'by_dn_ou_path',
      ouMappingOverrides: parseOrganizationalUnitMappingOverrides(overrides),
      roleSource: roleSource === 'ad_groups' ? 'ad_groups' : 'local_db',
      adminGroupDn: text(adminGroupDn) || null,
      agentGroupDn: text(agentGroupDn) || null,
    };
  }
}

/** Throws when an LDAPS operation cannot start; lists the missing fields. */
export function assertLdapsConfigured(configuration: LdapsSyncConfiguration): void {
  const missing: string[] = [];
  if (configuration.connection.urls.length === 0) missing.push('private.auth.adLdapsUrlsCsv');
  if (configuration.connection.bindDn === '') missing.push('private.auth.adBindDn');
  if (configuration.connection.bindPassword === '') missing.push('private.auth.adBindPassword');
  // RAW §466: never the whole forest (`DC=epbih,DC=ba`) — an OU is required.
  if (!hasOrganizationalUnit(configuration.usersBaseDn)) {
    missing.push('private.auth.adRead.usersBaseDn');
  }
  if (configuration.groupsBaseDn !== '' && !hasOrganizationalUnit(configuration.groupsBaseDn)) {
    missing.push('private.auth.adRead.groupsBaseDn');
  }
  if (missing.length > 0) {
    throw new DirectorySyncError('DIRECTORY_NOT_CONFIGURED', 'LDAPS settings incomplete', {
      missing,
    });
  }
}

function hasOrganizationalUnit(dn: string): boolean {
  return dn !== '' && parseDistinguishedName(dn).some((part) => part.type === 'OU');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function integer(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}
