import type { SocketPrincipal } from './socket-authentication.types';

export function isSocketPrincipal(value: unknown): value is SocketPrincipal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('subjectId' in value)) {
    return false;
  }
  return (
    typeof value.subjectId === 'string' && value.subjectId.trim().length > 0
  );
}
