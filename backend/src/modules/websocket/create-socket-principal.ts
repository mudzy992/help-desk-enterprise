import type { SocketPrincipal } from './socket-authentication.types';

export function createSocketPrincipal(subjectId: string): SocketPrincipal {
  return { subjectId };
}
