export type UsersErrorCode =
  | 'USER_NOT_FOUND'
  | 'ROLE_NOT_FOUND'
  | 'USER_ROLE_NOT_FOUND'
  | 'ORGANIZATIONAL_UNIT_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'SUPER_ADMIN_GRANT_FORBIDDEN'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'EMAIL_CONFLICT'
  | 'HAS_OPEN_TICKETS'
  | 'DELETE_RESTRICTED';

export class UsersError extends Error {
  constructor(readonly code: UsersErrorCode) {
    super(code);
    this.name = 'UsersError';
  }
}
