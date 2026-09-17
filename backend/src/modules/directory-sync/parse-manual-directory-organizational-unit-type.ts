import { OrganizationalUnitType } from '../../generated/prisma/enums';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';

const allowedTypes = new Set<string>(Object.values(OrganizationalUnitType));

export function parseManualDirectoryOrganizationalUnitType(
  value: string | undefined | null,
  fallback: OrganizationalUnitType,
): OrganizationalUnitType {
  if (value === undefined || value === null || value.trim().length === 0) {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  if (!allowedTypes.has(normalized)) {
    throw new ManualDirectoryCatalogError('INVALID_INPUT');
  }
  return normalized as OrganizationalUnitType;
}

export function defaultManualDirectoryOrganizationalUnitType(
  parentExternalId: string | null,
): OrganizationalUnitType {
  return parentExternalId === null
    ? OrganizationalUnitType.DIRECTORATE
    : OrganizationalUnitType.BRANCH;
}
