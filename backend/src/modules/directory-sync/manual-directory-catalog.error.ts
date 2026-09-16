export type ManualDirectoryCatalogErrorCode =
  | 'NOT_FOUND'
  | 'HAS_CHILDREN'
  | 'HAS_MAPPED_USERS'
  | 'PARENT_NOT_FOUND'
  | 'IDENTITY_CONFLICT'
  | 'INVALID_INPUT';

export class ManualDirectoryCatalogError extends Error {
  constructor(readonly code: ManualDirectoryCatalogErrorCode) {
    super(code);
    this.name = 'ManualDirectoryCatalogError';
  }
}
