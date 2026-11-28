import {
  createDistinguishedNameComparisonKey,
  formatDistinguishedName,
  isDistinguishedNameWithinBase,
  parseDistinguishedName as parseRfc4514DistinguishedName,
} from '../../../common/ldap/rfc4514-distinguished-name';

/**
 * W2.37 (BA-organizational-units-07): the LDAPS mapping path used to carry its own
 * DN reader — split on unescaped commas, unescape by regular expression, compare
 * by string suffix. The API validators carried a second one that did not
 * understand escapes at all, so a manual and a synced entry could disagree about
 * the same name. Both now go through `common/ldap/rfc4514-distinguished-name`;
 * this file is the thin, mapping-specific view of it.
 *
 * Attribute values are returned **unescaped** (`Anić, Ana`), attribute types are
 * upper-cased. A multi-valued RDN is flattened into one part per attribute, in
 * the order written, because the mapping code only ever looks at `type`/`value`.
 */
export type DistinguishedNamePart = { readonly type: string; readonly value: string };

export function parseDistinguishedName(dn: string): DistinguishedNamePart[] {
  return parseRfc4514DistinguishedName(dn).flatMap((relative) =>
    relative.attributes.map((attribute) => ({
      type: attribute.type,
      value: attribute.value,
    })),
  );
}

/**
 * Canonical comparison form shared with the manual-catalogue duplicate check:
 * attribute types upper-cased, values re-escaped, everything case-folded.
 */
export function normalizeDistinguishedNameForComparison(dn: string): string {
  return createDistinguishedNameComparisonKey(dn);
}

export function isDistinguishedNameWithin(dn: string, baseDn: string): boolean {
  return isDistinguishedNameWithinBase({
    distinguishedName: dn,
    baseDistinguishedName: baseDn,
  });
}

/**
 * OU path used by the application (`/Korisnici/Podružnica Zenica/Visoko`): OU values
 * from the top down. For a user DN the leading CN is skipped, so the path is
 * the user's container.
 */
export function organizationalUnitPathFromDistinguishedName(dn: string): string | null {
  const organizationalUnits = parseDistinguishedName(dn)
    .filter((part) => part.type === 'OU')
    .map((part) => part.value);
  if (organizationalUnits.length === 0) {
    return null;
  }
  return `/${organizationalUnits.reverse().join('/')}`;
}

/** DN of the container of an entry: everything after the first RDN. */
export function parentDistinguishedName(dn: string): string | null {
  const relatives = parseRfc4514DistinguishedName(dn);
  if (relatives.length <= 1) {
    return null;
  }
  return formatDistinguishedName(relatives.slice(1));
}
