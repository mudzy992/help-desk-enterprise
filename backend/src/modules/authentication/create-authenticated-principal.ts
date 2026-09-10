import { normalizeEmailAddress } from './normalize-email-address';
import type { AuthenticatedPrincipal } from './authentication.types';

export function createAuthenticatedPrincipal(input: {
  readonly subjectId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isLocalOnly: boolean;
}): AuthenticatedPrincipal {
  const subjectId = input.subjectId.trim();
  const displayName = input.displayName.trim();
  const email = normalizeEmailAddress(input.email);
  if (subjectId.length === 0 || displayName.length === 0 || email.length === 0) {
    throw new Error('Authenticated principal is incomplete');
  }
  return {
    subjectId,
    email,
    displayName,
    isLocalOnly: input.isLocalOnly,
  };
}
