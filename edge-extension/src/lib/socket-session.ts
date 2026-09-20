import { io, type Socket } from 'socket.io-client';

/**
 * Isti handshake ugovor kao web klijent: `auth.token` u `user:{userId}` sobu.
 * MV3 SW koristi čisti WebSocket transport (nema XHR long-pollinga).
 */
export function connectUserSocket(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly reconnectMaxBackoffSeconds: number;
}): Socket {
  return io(input.apiBaseUrl, {
    auth: { token: input.accessToken },
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: Math.max(1, input.reconnectMaxBackoffSeconds) * 1_000,
    timeout: 20_000,
    transports: ['websocket'],
    upgrade: false,
  });
}
