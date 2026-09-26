import type { LdapsConnectionSettings } from './ldap-directory-client';

/** Paket 1.8: normalized AD entries (only the attributes we read). */
export type LdapsDirectoryUserEntry = {
  readonly guid: string | null;
  readonly distinguishedName: string;
  readonly email: string | null;
  readonly userPrincipalName: string | null;
  readonly samAccountName: string | null;
  readonly displayName: string;
  readonly company: string | null;
  readonly department: string | null;
  readonly memberOf: readonly string[];
  readonly disabled: boolean;
};

export type LdapsDirectoryOrganizationalUnitEntry = {
  readonly guid: string | null;
  readonly distinguishedName: string;
  readonly name: string;
  readonly path: string;
};

export type LdapsDirectoryGroupEntry = {
  readonly guid: string | null;
  readonly distinguishedName: string;
  readonly name: string;
};

export type OrganizationalUnitMappingOverride =
  | { readonly dnSuffix: string; readonly ouPath: string }
  | { readonly company: string; readonly department?: string; readonly ouPath: string };

export type DirectoryReadSource = 'manual_catalog' | 'ldaps';

export type LdapsSyncConfiguration = {
  readonly source: DirectoryReadSource;
  readonly enabled: boolean;
  readonly strategy: 'manual_only' | 'scheduled';
  readonly connection: LdapsConnectionSettings;
  readonly usersBaseDn: string;
  readonly groupsBaseDn: string;
  readonly pageSize: number;
  readonly userFilter: string;
  readonly retryBackoffMilliseconds: number;
  readonly syncCooldownMilliseconds: number;
  readonly maxDeactivationPercent: number;
  readonly scheduleCron: string;
  readonly ouMappingStrategy: 'by_dn_ou_path' | 'by_company_department';
  readonly ouMappingOverrides: readonly OrganizationalUnitMappingOverride[];
  readonly roleSource: 'local_db' | 'ad_groups';
  readonly adminGroupDn: string | null;
  readonly agentGroupDn: string | null;
};

export const ldapsUserAttributes = [
  'objectGUID',
  'distinguishedName',
  'mail',
  'userPrincipalName',
  'sAMAccountName',
  'displayName',
  'givenName',
  'sn',
  'company',
  'department',
  'memberOf',
  'userAccountControl',
] as const;

export const ldapsOrganizationalUnitAttributes = [
  'objectGUID',
  'distinguishedName',
  'ou',
  'name',
] as const;

export const ldapsGroupAttributes = [
  'objectGUID',
  'distinguishedName',
  'cn',
  'name',
] as const;

export const ldapsDefaults = {
  connectTimeoutMilliseconds: 10_000,
  operationTimeoutMilliseconds: 30_000,
  organizationalUnitFilter: '(objectClass=organizationalUnit)',
  groupFilter: '(objectClass=group)',
  /** UF_ACCOUNTDISABLE */
  accountDisabledFlag: 0x2,
} as const;

/** Prefix of directory external ids that come from AD (objectGUID). */
export const ldapsExternalIdPrefix = 'ad:';
