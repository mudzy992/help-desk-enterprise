import { normalizeEmailAddress } from '../../authentication/normalize-email-address';
import {
  organizationalUnitPathFromDistinguishedName,
  parseDistinguishedName,
} from './distinguished-name';
import { formatObjectGuid } from './format-object-guid';
import type { LdapEntry } from './ldap-directory-client';
import {
  ldapsDefaults,
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
