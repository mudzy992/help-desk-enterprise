import type { AuthorizationPrincipal } from './authentication.types';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';

export const AUTHENTICATED_PRINCIPAL_REQUEST_KEY = 'authenticatedPrincipal';
/** Phase 2.2: the single load of the caller, shared by the guard chain. */
export const PRINCIPAL_CONTEXT_REQUEST_KEY = 'principalContext';
/** Paket 2.1: the caller's registry session id (`sid`), null for older tokens. */
export const SESSION_ID_REQUEST_KEY = 'authenticatedSessionId';

export type AuthenticatedHttpRequest = {
  headers?: { authorization?: string };
  params?: Record<string, unknown>;
  body?: unknown;
  query?: Record<string, unknown>;
  [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]?: AuthorizationPrincipal;
  [PRINCIPAL_CONTEXT_REQUEST_KEY]?: PrincipalContext;
  [SESSION_ID_REQUEST_KEY]?: string | null;
};

export function readSessionId(request: AuthenticatedHttpRequest): string | null {
  return request[SESSION_ID_REQUEST_KEY] ?? null;
}

/**
 * Reads the caller's principal context off the request. Guards that run after
 * the session guard use this instead of loading the same record again; callers
 * without a request (services, worker jobs) go through `PrincipalContextLoader`,
 * which reads the same cached value.
 */
export function readPrincipalContext(
  request: AuthenticatedHttpRequest,
): PrincipalContext | null {
  return request[PRINCIPAL_CONTEXT_REQUEST_KEY] ?? null;
}

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
