export const cacheInvalidationErrorCodes = {
  invalidInput: 'CACHE_INVALIDATION_INPUT_INVALID',
  invalidRevision: 'CACHE_INVALIDATION_REVISION_INVALID',
} as const;

export class CacheInvalidationError extends Error {
  constructor(readonly code: (typeof cacheInvalidationErrorCodes)[keyof typeof cacheInvalidationErrorCodes]) {
    super(code);
    this.name = 'CacheInvalidationError';
  }
}
