export const databaseLockErrorCodes = {
  invalidIdentity: 'DATABASE_LOCK_IDENTITY_INVALID',
  timeout: 'DATABASE_LOCK_TIMEOUT',
  unavailable: 'DATABASE_LOCK_UNAVAILABLE',
  rowNotFound: 'DATABASE_LOCK_ROW_NOT_FOUND',
} as const;

export class DatabaseLockError extends Error {
  constructor(readonly code: (typeof databaseLockErrorCodes)[keyof typeof databaseLockErrorCodes]) {
    super(code);
    this.name = 'DatabaseLockError';
  }
}
