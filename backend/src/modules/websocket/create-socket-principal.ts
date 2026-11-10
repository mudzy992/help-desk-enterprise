import type { SocketPrincipal } from './socket-authentication.types';

/** Copy only the verified lease fields; never retain the bearer token. */
export function createSocketPrincipal(principal: SocketPrincipal): SocketPrincipal {
  return {
    subjectId: principal.subjectId.trim(),
    sessionId: principal.sessionId,
    jti: principal.jti,
    issuedAt: principal.issuedAt,
    expiresAt: principal.expiresAt,
    authzVersion: principal.authzVersion,
  };
}
