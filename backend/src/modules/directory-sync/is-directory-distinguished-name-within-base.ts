import { isDistinguishedNameWithinBase } from '../../common/ldap/rfc4514-distinguished-name';

/**
 * W2.37 (BA-organizational-units-07): RDN-aware replacement for the
 * `endsWith(',<base>')` suffix test. The base itself counts as "within base",
 * and a name that differs only by attribute-value case does too — the comparison
 * key folds case, exactly like the manual-catalogue duplicate check.
 */
export function isDirectoryDistinguishedNameWithinBase(input: {
  readonly distinguishedName: string;
  readonly baseDistinguishedName: string;
}): boolean {
  return isDistinguishedNameWithinBase(input);
}
