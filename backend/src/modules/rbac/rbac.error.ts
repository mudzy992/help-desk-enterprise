export type RbacErrorCode =
  | 'ROLE_NOT_FOUND'
  | 'INVALID_PERMISSION_KEY'
  | 'FORBIDDEN'
  // Paket 5.1 (M4 B2): promjena prava traži pregled uticaja (potpisan token).
  | 'PREVIEW_REQUIRED'
  | 'PREVIEW_STALE';

export class RbacError extends Error {
  constructor(readonly code: RbacErrorCode) {
    super(code);
    this.name = 'RbacError';
  }
}
