import { io, type Socket } from 'socket.io-client';

export function connectUserSocket(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly reconnectMaxBackoffSeconds: number;
}): Socket {
  return io(input.apiBaseUrl, {
    auth: { token: input.accessToken },
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: input.reconnectMaxBackoffSeconds * 1000,
  });
}
