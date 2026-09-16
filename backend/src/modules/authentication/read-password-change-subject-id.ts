import { authenticationConstants } from './authentication.constants';
import { createInvalidCredentialsError } from './authentication.error';

export function readPasswordChangeSubjectId(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw createInvalidCredentialsError();
  }
  const record = payload as Record<string, unknown>;
  if (record['purpose'] !== authenticationConstants.passwordChangePurpose) {
    throw createInvalidCredentialsError();
  }
  const subjectId = record['sub'];
  if (typeof subjectId !== 'string' || subjectId.trim().length === 0) {
    throw createInvalidCredentialsError();
  }
  return subjectId.trim();
}
