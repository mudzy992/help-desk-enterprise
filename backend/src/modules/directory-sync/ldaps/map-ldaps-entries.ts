import { normalizeEmailAddress } from '../../authentication/normalize-email-address';
import {
  organizationalUnitPathFromDistinguishedName,
  parseDistinguishedName,
} from './distinguished-name';
import { formatObjectGuid } from './format-object-guid';
import type { LdapEntry } from './ldap-directory-client';
import {
  ldapsDefaults,
  type LdapsDirectoryComputerEntry,
  type LdapsDirectoryGroupEntry,
  type LdapsDirectoryOrganizationalUnitEntry,
  type LdapsDirectoryUserEntry,
} from './ldaps-directory.types';
import { readLdapBuffer, readLdapString, readLdapStrings } from './read-ldap-attribute';

export function mapLdapsUserEntry(entry: LdapEntry): LdapsDirectoryUserEntry | null {
  const distinguishedName = readLdapString(entry, 'distinguishedName') ?? readLdapString(entry, 'dn');
  if (distinguishedName === null) {
    return null;
  }
  const mail = readLdapString(entry, 'mail');
  const givenName = readLdapString(entry, 'givenName');
  const surname = readLdapString(entry, 'sn');
  const samAccountName = readLdapString(entry, 'sAMAccountName');
  const displayName =
    readLdapString(entry, 'displayName') ??
    ([givenName, surname].filter(Boolean).join(' ') || samAccountName || distinguishedName);
  const userAccountControl = Number.parseInt(readLdapString(entry, 'userAccountControl') ?? '0', 10);
  return {
    guid: formatObjectGuid(readLdapBuffer(entry, 'objectGUID')),
    distinguishedName,
    email: mail === null ? null : normalizeEmailAddress(mail),
    userPrincipalName: readLdapString(entry, 'userPrincipalName'),
    samAccountName,
    displayName,
    company: readLdapString(entry, 'company'),
    department: readLdapString(entry, 'department'),
    memberOf: readLdapStrings(entry, 'memberOf'),
    disabled:
      Number.isFinite(userAccountControl) &&
      (userAccountControl & ldapsDefaults.accountDisabledFlag) !== 0,
  };
}

export function mapLdapsOrganizationalUnitEntry(
  entry: LdapEntry,
): LdapsDirectoryOrganizationalUnitEntry | null {
  const distinguishedName = readLdapString(entry, 'distinguishedName') ?? readLdapString(entry, 'dn');
  if (distinguishedName === null) {
    return null;
  }
  const path = organizationalUnitPathFromDistinguishedName(distinguishedName);
  const firstPart = parseDistinguishedName(distinguishedName)[0];
  if (path === null || firstPart?.type !== 'OU') {
    return null;
  }
  return {
    guid: formatObjectGuid(readLdapBuffer(entry, 'objectGUID')),
    distinguishedName,
    name: readLdapString(entry, 'ou') ?? readLdapString(entry, 'name') ?? firstPart.value,
    path,
  };
}

export function mapLdapsGroupEntry(entry: LdapEntry): LdapsDirectoryGroupEntry | null {
  const distinguishedName = readLdapString(entry, 'distinguishedName') ?? readLdapString(entry, 'dn');
  if (distinguishedName === null) {
    return null;
  }
  return {
    guid: formatObjectGuid(readLdapBuffer(entry, 'objectGUID')),
    distinguishedName,
    name:
      readLdapString(entry, 'cn') ??
      readLdapString(entry, 'name') ??
      parseDistinguishedName(distinguishedName)[0]?.value ??
      distinguishedName,
  };
}

/** Windows FILETIME (100 ns since 1601-01-01) → Date; 0 / "never" → null. */
export function fileTimeToDate(value: string | null): Date | null {
  if (value === null || !/^\d{1,20}$/.test(value)) return null;
  const ticks = BigInt(value);
  if (ticks === 0n || ticks >= 0x7fffffffffffffffn) return null;
  const milliseconds = Number(ticks / 10_000n) - 11_644_473_600_000;
  return milliseconds > 0 ? new Date(milliseconds) : null;
}

export function mapLdapsComputerEntry(entry: LdapEntry): LdapsDirectoryComputerEntry | null {
  const distinguishedName = readLdapString(entry, 'distinguishedName') ?? readLdapString(entry, 'dn');
  const guid = formatObjectGuid(readLdapBuffer(entry, 'objectGUID'));
  if (distinguishedName === null || guid === null) {
    return null;
  }
  const userAccountControl = Number.parseInt(readLdapString(entry, 'userAccountControl') ?? '0', 10);
  return {
    guid,
    distinguishedName,
    name: readLdapString(entry, 'cn') ?? parseDistinguishedName(distinguishedName)[0]?.value ?? distinguishedName,
    dnsHostName: readLdapString(entry, 'dNSHostName'),
    operatingSystem: readLdapString(entry, 'operatingSystem'),
    operatingSystemVersion: readLdapString(entry, 'operatingSystemVersion'),
    lastLogonAt: fileTimeToDate(readLdapString(entry, 'lastLogonTimestamp')),
    managedBy: readLdapString(entry, 'managedBy'),
    description: readLdapString(entry, 'description'),
    disabled: Number.isFinite(userAccountControl) && (userAccountControl & ldapsDefaults.accountDisabledFlag) !== 0,
  };
}
