import type { OrganizationalUnitDeleteBlocker } from '../organizational-units/organizational-unit-delete.types';

export type ManualDirectoryCatalogErrorCode =
  | 'NOT_FOUND'
  | 'HAS_CHILDREN'
  | 'HAS_MAPPED_USERS'
  | 'HAS_GROUPS'
  | 'PARENT_NOT_FOUND'
  | 'IDENTITY_CONFLICT'
  | 'INVALID_INPUT'
  | 'CIRCULAR_REFERENCE';

export class ManualDirectoryCatalogError extends Error {
  constructor(
    readonly code: ManualDirectoryCatalogErrorCode,
    readonly blockers: readonly OrganizationalUnitDeleteBlocker[] = [],
  ) {
    super(code);
    this.name = 'ManualDirectoryCatalogError';
  }
}
