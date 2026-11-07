import type { SocketPrincipal } from './socket-authentication.types';

export function isSocketPrincipal(value: unknown): value is SocketPrincipal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<SocketPrincipal>;
  return (
    typeof candidate.subjectId === 'string' &&
    candidate.subjectId.trim().length > 0 &&
    (candidate.sessionId === null ||
      (typeof candidate.sessionId === 'string' &&
        candidate.sessionId.trim().length > 0)) &&
    typeof candidate.jti === 'string' &&
    candidate.jti.trim().length > 0 &&
    Number.isSafeInteger(candidate.issuedAt) &&
    (candidate.issuedAt ?? -1) >= 0 &&
    Number.isSafeInteger(candidate.expiresAt) &&
    (candidate.expiresAt ?? 0) > (candidate.issuedAt ?? 0) &&
    Number.isSafeInteger(candidate.authzVersion) &&
    (candidate.authzVersion ?? -1) >= 0
  );
}
