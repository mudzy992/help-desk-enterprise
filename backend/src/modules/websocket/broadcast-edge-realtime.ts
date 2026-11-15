import type { Server } from 'socket.io';
import type { EdgeEventRealtimePublish } from '../tickets/ticket-realtime.types';
import { userRoomName } from './ticket-socket-rooms';

/** EDGE payloads are addressed to one user; ticket access is not recipient authorization. */
export function broadcastEdgeEventRealtime(
  server: Server,
  event: EdgeEventRealtimePublish,
): void {
  server.to(userRoomName(event.userId)).emit(event.eventName, event.data);
}
