import {
  createCanonicalDistinguishedName,
  DistinguishedNameSyntaxError,
  parseDistinguishedName,
  type DistinguishedNameAttribute,
} from '../../common/ldap/rfc4514-distinguished-name';
import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';

const allowedAttributeTypes = new Set<string>(
  directorySyncConstants.allowedDistinguishedNameAttributeTypes,
);

/**
 * W2.37 (BA-organizational-units-07): the read scope uses the same RFC 4514
 * parser as the organizational-unit API, so a scope an administrator copies out
 * of AD (`OU=Korisnici\, Inc.,DC=local`, `OU="Korisnici, Inc.",DC=local`,
 * `OU=A+CN=B,DC=local`) is read the same way the LDAPS mapping path reads it.
 *
 * Values keep their escaping in the canonical form and a `/` is still refused,
 * because the same value also appears in a `/`-separated `ouPath`.
 */
export function normalizeDirectoryDistinguishedName(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > directorySyncConstants.maximumDistinguishedNameLength
  ) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  const relatives = parseOrInvalidScope(trimmed);
  for (const relative of relatives) {
    for (const attribute of relative.attributes) {
      assertSupportedAttribute(attribute);
    }
  }
  const canonical = createCanonicalDistinguishedName(trimmed);
  if (
    canonical.length > directorySyncConstants.maximumDistinguishedNameLength
  ) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  return canonical;
}

function parseOrInvalidScope(
  value: string,
): ReturnType<typeof parseDistinguishedName> {
  try {
    return parseDistinguishedName(value);
  } catch (error: unknown) {
    if (error instanceof DistinguishedNameSyntaxError) {
      throw new DirectorySyncError('INVALID_SCOPE');
    }
    throw error;
  }
}

function assertSupportedAttribute(attribute: DistinguishedNameAttribute): void {
  if (!allowedAttributeTypes.has(attribute.type.toUpperCase())) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
  if (attribute.encoding === 'hex') {
    return;
  }
  if (attribute.value.length === 0 || attribute.value.includes('/')) {
    throw new DirectorySyncError('INVALID_SCOPE');
  }
}
