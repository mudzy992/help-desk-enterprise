import { installSlaReviewErrorCodes } from './install-sla-review.constants';

export type InstallSlaReviewErrorCode =
  (typeof installSlaReviewErrorCodes)[keyof typeof installSlaReviewErrorCodes];

export class InstallSlaReviewError extends Error {
  constructor(
    readonly code: InstallSlaReviewErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallSlaReviewError';
  }
}
