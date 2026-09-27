import type { SocketPrincipal } from './socket-authentication.types';

declare module 'socket.io' {
  interface SocketData {
    principal?: SocketPrincipal;
    requestId?: string;
    /** Paket 2.4: presence rate-limit window and the tickets this socket is present on. */
    presenceWindow?: { start: number; count: number };
    presenceTickets?: Set<string>;
  }
}
