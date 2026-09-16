export type GroupsErrorCode =
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'ORGANIZATIONAL_UNIT_NOT_FOUND'
  | 'INVALID_NAME'
  | 'DUPLICATE_KEY'
  | 'MEMBER_ALREADY_EXISTS'
  | 'MEMBER_NOT_FOUND'
  | 'SOLE_FALLBACK_GROUP'
  | 'HAS_ACTIVE_TICKETS';

export class GroupsError extends Error {
  constructor(
    readonly code: GroupsErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'GroupsError';
  }
}
