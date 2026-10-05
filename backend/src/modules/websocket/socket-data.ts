import type { JoinLeaveWindow } from './join-leave-rate-limiter';
import type { SocketPrincipal } from './socket-authentication.types';

declare module 'socket.io' {
  interface SocketData {
    principal?: SocketPrincipal;
    requestId?: string;
    /** Paket 2.4: presence rate-limit window and the tickets this socket is present on. */
    presenceWindow?: { start: number; count: number };
    presenceTickets?: Set<string>;
    /** Val 3 (M11/B2): join/leave rate-limit window for this socket. */
    joinLeaveWindow?: JoinLeaveWindow;
  }
}
