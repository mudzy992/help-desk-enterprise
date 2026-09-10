export type ServiceCatalogErrorCode =
  | 'NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'POLICY_PACK_NOT_FOUND'
  | 'INVALID_NAME'
  | 'INVALID_SLUG'
  | 'DUPLICATE_SLUG'
  | 'INVALID_PARENT_CATEGORY'
  | 'SELF_PARENT_CATEGORY'
  | 'CIRCULAR_CATEGORY'
  | 'CATEGORY_HAS_CHILDREN'
  | 'CATEGORY_HAS_SERVICES'
  | 'INVALID_LIFECYCLE_STATE'
  | 'INVALID_LIFECYCLE_TRANSITION'
  | 'LIFECYCLE_DISABLED'
  | 'LIFECYCLE_UNAVAILABLE'
  | 'SLUG_IMMUTABLE'
  | 'NOT_DELETABLE'
  | 'HAS_DEPENDENCIES';

export class ServiceCatalogError extends Error {
  constructor(
    readonly code: ServiceCatalogErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'ServiceCatalogError';
  }
}
