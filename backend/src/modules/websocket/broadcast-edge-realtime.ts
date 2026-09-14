import type { Server } from 'socket.io';
import type { EdgeEventRealtimePublish } from '../tickets/ticket-realtime.types';
import { ticketRoomName, userRoomName } from './ticket-socket-rooms';

export function broadcastEdgeEventRealtime(
  server: Server,
  event: EdgeEventRealtimePublish,
): void {
  server.to(userRoomName(event.userId)).emit(event.eventName, event.data);
  if (event.ticketId !== undefined) {
    server.to(ticketRoomName(event.ticketId)).emit(event.eventName, event.data);
  }
}
