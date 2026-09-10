import type {
  AuthenticatedPrincipal,
  AuthorizationPrincipal,
} from './authentication.types';

export function toAuthorizationPrincipal(
  principal: AuthenticatedPrincipal,
): AuthorizationPrincipal {
  return {
    subjectId: principal.subjectId,
    email: principal.email,
    displayName: principal.displayName,
    isLocalOnly: principal.isLocalOnly,
  };
}
