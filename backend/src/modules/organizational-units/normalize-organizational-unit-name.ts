import { organizationalUnitConstants } from './organizational-unit.constants';
import { OrganizationalUnitError } from './organizational-unit.error';

export function normalizeOrganizationalUnitName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (
    name.length === 0 ||
    name.length > organizationalUnitConstants.maximumNameLength ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes(',')
  ) {
    throw new OrganizationalUnitError('INVALID_NAME');
  }
  return name;
}
