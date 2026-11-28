import { organizationalUnitConstants } from '../organizational-units/organizational-unit.constants';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';

/**
 * W2.36c: the name a person types must become exactly one RDN (`OU=<name>`) and
 * one path segment. A name is refused when it cannot survive that trip
 * unchanged:
 *
 * - `,` splits the distinguished name into a second RDN,
 * - `=` turns the value into `OU=a=b`, which the DN normalizer reads differently
 *   than the operator wrote it,
 * - `/` and `\` split or escape the path,
 * - `+`, `"`, `;`, `<`, `>` are LDAP DN/ filter specials that would need
 *   escaping nobody would see in the UI,
 * - control characters cannot be audited or displayed reliably.
 *
 * The refusal names **which rule** the value broke, so the form can point at the
 * field instead of showing a generic failure.
 */
const forbiddenNameCharacters = /[,+/\\"<>;=]/u;
// eslint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001F\u007F]/u;

export type DirectoryOrganizationalUnitNameProblem =
  | 'empty'
  | 'too_long'
  | 'forbidden_character';

export function describeManualOrganizationalUnitNameProblem(
  value: string,
): DirectoryOrganizationalUnitNameProblem | null {
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length === 0) {
    return 'empty';
  }
  if (name.length > organizationalUnitConstants.maximumNameLength) {
    return 'too_long';
  }
  if (forbiddenNameCharacters.test(name) || controlCharacters.test(name)) {
    return 'forbidden_character';
  }
  return null;
}

export function normalizeManualOrganizationalUnitName(value: string): string {
  const problem = describeManualOrganizationalUnitNameProblem(value);
  if (problem !== null) {
    throw new ManualDirectoryCatalogError('INVALID_NAME', [], { reason: problem });
  }
  return value.trim().replace(/\s+/g, ' ');
}
