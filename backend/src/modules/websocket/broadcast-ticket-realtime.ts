import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import {
  groupRoomName,
  ticketPublicRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';

export function broadcastTicketMessage(
  server: Server,
  payload: TicketRealtimeMessagePayload,
): void {
  const event = ticketRealtimeEventNames.messageCreated;
  server.to(ticketStaffRoomName(payload.ticketId)).emit(event, payload);
  if (payload.visibility === 'public') {
    server.to(ticketPublicRoomName(payload.ticketId)).emit(event, payload);
    server.to(userRoomName(payload.requesterId)).emit(event, payload);
  }
  if (payload.assignedGroupId !== null) {
    server.to(groupRoomName(payload.assignedGroupId)).emit(event, payload);
  }
}

export function broadcastTicketUpdated(
  server: Server,
  payload: TicketUpdatedRealtimePayload,
): void {
  const event = ticketRealtimeEventNames.ticketUpdated;
  server.to(ticketStaffRoomName(payload.ticketId)).emit(event, payload);
  if (payload.visibility === 'public') {
    server.to(ticketPublicRoomName(payload.ticketId)).emit(event, payload);
  }
}
