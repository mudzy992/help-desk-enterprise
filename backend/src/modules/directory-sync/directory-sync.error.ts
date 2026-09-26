export type DirectorySyncErrorCode =
  | 'INVALID_SCOPE'
  | 'DIRECTORY_READ_DISABLED'
  | 'DIRECTORY_READ_THROTTLED'
  | 'DIRECTORY_SYNC_UNAVAILABLE'
  // Paket 1.8 (LDAPS)
  | 'DIRECTORY_NOT_CONFIGURED'
  | 'DIRECTORY_SOURCE_NOT_LDAPS'
  | 'DIRECTORY_CONNECTION_FAILED'
  | 'DIRECTORY_BACKOFF'
  | 'DIRECTORY_SYNC_COOLDOWN'
  | 'DIRECTORY_SYNC_IN_PROGRESS'
  | 'DIRECTORY_PLAN_NOT_FOUND'
  | 'DIRECTORY_PLAN_EXPIRED'
  | 'DIRECTORY_PLAN_ALREADY_APPLIED'
  | 'DIRECTORY_SAFEGUARD_TRIPPED';

export class DirectorySyncError extends Error {
  constructor(
    readonly code: DirectorySyncErrorCode,
    message: string = code,
    /** Secret-free details for the UI (e.g. per-DC error codes, retryAt). */
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'DirectorySyncError';
  }
}
