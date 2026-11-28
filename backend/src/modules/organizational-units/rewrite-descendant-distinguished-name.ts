import { rewriteDistinguishedNameAncestor } from '../../common/ldap/rfc4514-distinguished-name';
import { organizationalUnitConstants } from './organizational-unit.constants';
import { OrganizationalUnitError } from './organizational-unit.error';

/**
 * W2.37 (BA-organizational-units-07): replaces a trailing ancestor by RDN
 * boundaries, not by string slicing, so a renamed unit whose value contains an
 * escaped comma cannot produce a half-rewritten DN.
 *
 * The rewritten name is measured again after the replacement: the API limit
 * applies to the stored value, and a descendant can cross it even when both the
 * old and the new ancestor fit. Crossing it is refused with the same error the
 * validator uses, instead of writing a value outside the contract.
 */
export function rewriteDescendantDistinguishedName(input: {
  readonly currentDistinguishedName: string;
  readonly oldAncestorDistinguishedName: string;
  readonly newAncestorDistinguishedName: string;
}): string {
  const rewritten = rewriteDistinguishedNameAncestor({
    currentDistinguishedName: input.currentDistinguishedName,
    oldAncestorDistinguishedName: input.oldAncestorDistinguishedName,
    newAncestorDistinguishedName: input.newAncestorDistinguishedName,
  });
  if (rewritten === null) {
    return input.currentDistinguishedName;
  }
  if (
    rewritten.length > organizationalUnitConstants.maximumDistinguishedNameLength
  ) {
    throw new OrganizationalUnitError('INVALID_DISTINGUISHED_NAME');
  }
  return rewritten;
}
