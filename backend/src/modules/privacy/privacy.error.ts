import { privacyErrorMessages, type PrivacyErrorCode } from './privacy.constants';

export class PrivacyError extends Error {
  constructor(
    readonly code: PrivacyErrorCode,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(privacyErrorMessages[code]);
    this.name = 'PrivacyError';
  }
}
