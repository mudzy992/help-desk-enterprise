export type PolicyPackErrorCode =
  | 'UNKNOWN_POLICY_PACK'
  | 'INVALID_PACK_DEFINITION'
  | 'SUPER_ADMIN_GRANT_FORBIDDEN'
  | 'UNKNOWN_ROLE'
  | 'UNKNOWN_PERMISSION'
  | 'PERMISSION_NOT_ALLOWED_FOR_ROLE'
  | 'MISSING_ORGANIZATIONAL_UNIT'
  | 'UNKNOWN_ORGANIZATIONAL_UNIT'
  | 'MISSING_SERVICE'
  | 'UNKNOWN_SERVICE'
  | 'UNKNOWN_USER';

export class PolicyPackError extends Error {
  constructor(
    readonly code: PolicyPackErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'PolicyPackError';
  }
}
