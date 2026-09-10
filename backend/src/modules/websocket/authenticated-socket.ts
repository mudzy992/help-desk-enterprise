import type { Socket } from 'socket.io';
import { createSocketPrincipal } from './create-socket-principal';
import type { SocketPrincipal } from './socket-authentication.types';
import './socket-data';

export type AuthenticatedSocket = Socket & {
  data: Socket['data'] & {
    principal: SocketPrincipal;
  };
};

export function attachSocketPrincipal(
  socket: Socket,
  principal: SocketPrincipal,
): void {
  socket.data.principal = createSocketPrincipal(principal.subjectId);
}

export function getSocketPrincipal(socket: Socket): SocketPrincipal | undefined {
  return socket.data.principal;
}
