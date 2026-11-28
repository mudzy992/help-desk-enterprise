import {
  createCanonicalDistinguishedName,
  DistinguishedNameSyntaxError,
  parseDistinguishedName,
  type DistinguishedNameAttribute,
} from '../../common/ldap/rfc4514-distinguished-name';
import { organizationalUnitConstants } from './organizational-unit.constants';
import { OrganizationalUnitError } from './organizational-unit.error';

const allowedAttributeTypes = new Set<string>(
  organizationalUnitConstants.allowedDistinguishedNameAttributeTypes,
);

/**
 * W2.37 (BA-organizational-units-07): delegates to the shared RFC 4514 parser.
 *
 * Supported subset, beyond what the old `split(',')` implementation accepted:
 * escaped separators (`OU=Korisnici\, Inc.,DC=local`), escaped plus/backslash/
 * equals, hexadecimal byte escapes (`\C4\8D` → `č`), quoted values and
 * multi-valued RDNs. Attribute types are canonicalised to upper case and are
 * restricted to the OU/DC/CN/O set the API promises.
 *
 * Still refused on purpose: an empty attribute value (nothing to name), a `/` in
 * a value (`ouPath` uses `/` as its separator, so the value could not round-trip)
 * and a DN longer than the API limit — measured both before and after escaping.
 */
export function normalizeDistinguishedName(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > organizationalUnitConstants.maximumDistinguishedNameLength
  ) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
  const relatives = parseOrThrow(trimmed);
  for (const relative of relatives) {
    for (const attribute of relative.attributes) {
      assertSupportedAttribute(attribute);
    }
  }
  const canonical = createCanonicalDistinguishedName(trimmed);
  if (
    canonical.length > organizationalUnitConstants.maximumDistinguishedNameLength
  ) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
  return canonical;
}

function parseOrThrow(value: string): ReturnType<typeof parseDistinguishedName> {
  try {
    return parseDistinguishedName(value);
  } catch (error: unknown) {
    if (error instanceof DistinguishedNameSyntaxError) {
      throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
    }
    throw error;
  }
}

function assertSupportedAttribute(attribute: DistinguishedNameAttribute): void {
  if (!allowedAttributeTypes.has(attribute.type.toUpperCase())) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
  if (attribute.encoding === 'hex') {
    return;
  }
  if (attribute.value.length === 0 || attribute.value.includes('/')) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
}
