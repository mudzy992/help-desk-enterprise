import type { Socket } from "socket.io-client";

export function subscribeSocketEvent<T>(
  socket: Socket,
  eventName: string,
  handler: (payload: T) => void,
): () => void {
  socket.on(eventName, handler);
  return () => {
    socket.off(eventName, handler);
  };
}
