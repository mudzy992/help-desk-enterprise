import type { LdapEntry } from './ldap-directory-client';

export function readLdapString(entry: LdapEntry, attribute: string): string | null {
  const value = findAttribute(entry, attribute);
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined) {
    return null;
  }
  const text = (Buffer.isBuffer(first) ? first.toString('utf8') : String(first)).trim();
  return text.length > 0 ? text : null;
}

export function readLdapStrings(entry: LdapEntry, attribute: string): string[] {
  const value = findAttribute(entry, attribute);
  if (value === undefined) {
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => (Buffer.isBuffer(item) ? item.toString('utf8') : String(item)).trim())
    .filter((item) => item.length > 0);
}

export function readLdapBuffer(entry: LdapEntry, attribute: string): Buffer | undefined {
  const value = findAttribute(entry, attribute);
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined) {
    return undefined;
  }
  return Buffer.isBuffer(first) ? first : Buffer.from(String(first), 'binary');
}

/** LDAP attribute names are case-insensitive. */
function findAttribute(entry: LdapEntry, attribute: string) {
  if (attribute in entry) {
    return entry[attribute];
  }
  const lower = attribute.toLowerCase();
  const key = Object.keys(entry).find((candidate) => candidate.toLowerCase() === lower);
  return key === undefined ? undefined : entry[key];
}
