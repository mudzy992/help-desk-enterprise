import type { SocketPrincipal } from './socket-authentication.types';

declare module 'socket.io' {
  interface SocketData {
    principal?: SocketPrincipal;
    requestId?: string;
  }
}
