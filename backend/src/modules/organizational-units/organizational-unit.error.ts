export type OrganizationalUnitErrorCode =
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'INVALID_NAME'
  | 'INVALID_DISTINGUISHED_NAME'
  | 'DISTINGUISHED_NAME_PARENT_MISMATCH'
  | 'INVALID_PARENT'
  | 'SELF_PARENT'
  | 'CIRCULAR_HIERARCHY'
  | 'DUPLICATE_DISTINGUISHED_NAME'
  | 'DUPLICATE_OU_PATH'
  | 'HAS_CHILDREN'
  | 'HAS_MAPPED_USERS';

export class OrganizationalUnitError extends Error {
  constructor(
    readonly code: OrganizationalUnitErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'OrganizationalUnitError';
  }
}
