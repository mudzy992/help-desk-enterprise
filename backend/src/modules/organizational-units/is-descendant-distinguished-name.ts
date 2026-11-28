import { isStrictDistinguishedNameDescendant } from '../../common/ldap/rfc4514-distinguished-name';

/**
 * W2.37 (BA-organizational-units-07): decides on RDN boundaries through the
 * shared RFC 4514 parser instead of `endsWith(',<parent>')`. A parent whose own
 * value contains an escaped comma (`OU=Korisnici\, Inc.,DC=local`) or a
 * multi-valued RDN therefore matches its real descendants and nothing else.
 */
export function isDescendantDistinguishedName(input: {
  readonly childDistinguishedName: string;
  readonly parentDistinguishedName: string;
}): boolean {
  return isStrictDistinguishedNameDescendant({
    distinguishedName: input.childDistinguishedName,
    ancestorDistinguishedName: input.parentDistinguishedName,
  });
}
