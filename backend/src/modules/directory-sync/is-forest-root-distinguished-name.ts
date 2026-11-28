import { parseDistinguishedName } from '../../common/ldap/rfc4514-distinguished-name';

/**
 * W2.37 (BA-organizational-units-07): the forest root is decided per RDN through
 * the shared RFC 4514 parser: every RDN has exactly one `DC` attribute with a
 * non-empty value. `DC=example,DC=com` is the forest root; `OU=A,DC=local`,
 * `CN=A+DC=local` and `DC=local,OU=A` are not.
 */
export function isForestRootDistinguishedName(
  distinguishedName: string,
): boolean {
  const trimmed = distinguishedName.trim();
  if (trimmed.length === 0) {
    return true;
  }
  try {
    return parseDistinguishedName(trimmed).every(
      (relative) =>
        relative.attributes.length === 1 &&
        relative.attributes[0].type.toUpperCase() === 'DC' &&
        relative.attributes[0].encoding === 'string' &&
        relative.attributes[0].value.trim().length > 0,
    );
  } catch {
    return false;
  }
}
