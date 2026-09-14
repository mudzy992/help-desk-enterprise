import type { Socket } from 'socket.io';
import { resolveRequestId } from '../../common/request-context/resolve-request-id';
import { runWithRequestId } from '../../common/request-context/request-context.storage';

export function attachSocketRequestId(socket: Socket): string {
  const requestId = resolveRequestId(socket.handshake.headers);
  socket.data.requestId = requestId;
  return requestId;
}

export function runWithSocketRequestId<T>(
  socket: Socket,
  callback: () => T,
): T {
  const requestId = socket.data.requestId ?? attachSocketRequestId(socket);
  return runWithRequestId(requestId, callback);
}
