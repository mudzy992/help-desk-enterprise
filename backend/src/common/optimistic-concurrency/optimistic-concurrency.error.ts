import { HttpException } from '@nestjs/common';

export const optimisticConcurrencyErrorCodes = {
  preconditionRequired: 'OPTIMISTIC_PRECONDITION_REQUIRED',
  invalidIfMatch: 'OPTIMISTIC_IF_MATCH_INVALID',
  staleWrite: 'OPTIMISTIC_STALE_WRITE',
  resourceNotFound: 'OPTIMISTIC_RESOURCE_NOT_FOUND',
  invalidVersionTransition: 'OPTIMISTIC_VERSION_TRANSITION_INVALID',
} as const;

export type OptimisticConcurrencyErrorCode =
  (typeof optimisticConcurrencyErrorCodes)[keyof typeof optimisticConcurrencyErrorCodes];

export class OptimisticConcurrencyError extends HttpException {
  constructor(
    readonly code: OptimisticConcurrencyErrorCode,
    readonly httpStatus: 400 | 404 | 412 | 428 | 500,
    readonly currentEtag?: string,
  ) {
    super({ code, ...(currentEtag === undefined ? {} : { currentEtag }) }, httpStatus);
    this.name = 'OptimisticConcurrencyError';
  }
}
