import type { AuthorizationPrincipal } from './authentication.types';

export const AUTHENTICATED_PRINCIPAL_REQUEST_KEY = 'authenticatedPrincipal';

export type AuthenticatedHttpRequest = {
  headers?: { authorization?: string };
  params?: Record<string, unknown>;
  body?: unknown;
  query?: Record<string, unknown>;
  [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]?: AuthorizationPrincipal;
};

export function readAuthenticatedPrincipal(
  request: AuthenticatedHttpRequest,
): AuthorizationPrincipal | null {
  const principal = request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY];
  if (principal === undefined) {
    return null;
  }
  if (
    typeof principal.subjectId !== 'string' ||
    principal.subjectId.trim().length === 0
  ) {
    return null;
  }
  return principal;
}
