import type { OrganizationalUnitDeleteBlocker } from '../organizational-units/organizational-unit-delete.types';

export type ManualDirectoryCatalogErrorCode =
  | 'NOT_FOUND'
  | 'HAS_CHILDREN'
  | 'HAS_MAPPED_USERS'
  | 'HAS_GROUPS'
  | 'PARENT_NOT_FOUND'
  | 'IDENTITY_CONFLICT'
  | 'INVALID_INPUT'
  | 'CIRCULAR_REFERENCE'
  /*
    W2.36c: safe creation under a real tree node. Every code below is a refusal
    the operator can act on, so each one carries the values that collided.
  */
  | 'INVALID_NAME'
  | 'DUPLICATE_PATH'
  | 'DUPLICATE_DISTINGUISHED_NAME'
  | 'DIRECTORY_NAMESPACE_UNKNOWN';

export class ManualDirectoryCatalogError extends Error {
  constructor(
    readonly code: ManualDirectoryCatalogErrorCode,
    readonly blockers: readonly OrganizationalUnitDeleteBlocker[] = [],
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = 'ManualDirectoryCatalogError';
  }
}
