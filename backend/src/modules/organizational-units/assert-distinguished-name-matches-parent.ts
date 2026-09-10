import { isDescendantDistinguishedName } from './is-descendant-distinguished-name';
import { OrganizationalUnitError } from './organizational-unit.error';

export function assertDistinguishedNameMatchesParent(input: {
  readonly distinguishedName: string;
  readonly parentDistinguishedName: string | null;
}): void {
  if (input.parentDistinguishedName === null) {
    return;
  }
  if (
    !isDescendantDistinguishedName({
      childDistinguishedName: input.distinguishedName,
      parentDistinguishedName: input.parentDistinguishedName,
    })
  ) {
    throw new OrganizationalUnitError('DISTINGUISHED_NAME_PARENT_MISMATCH');
  }
}
