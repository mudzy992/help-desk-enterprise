export type RbacErrorCode =
  | 'ROLE_NOT_FOUND'
  | 'INVALID_PERMISSION_KEY'
  | 'FORBIDDEN';

export class RbacError extends Error {
  constructor(readonly code: RbacErrorCode) {
    super(code);
    this.name = 'RbacError';
  }
}
