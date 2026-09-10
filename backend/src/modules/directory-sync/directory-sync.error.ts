export type DirectorySyncErrorCode =
  | 'INVALID_SCOPE'
  | 'DIRECTORY_READ_DISABLED'
  | 'DIRECTORY_READ_THROTTLED'
  | 'DIRECTORY_SYNC_UNAVAILABLE';

export class DirectorySyncError extends Error {
  constructor(
    readonly code: DirectorySyncErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'DirectorySyncError';
  }
}
