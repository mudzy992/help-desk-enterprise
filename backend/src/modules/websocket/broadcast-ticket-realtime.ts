import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import { ticketUpdatedBroadcastRooms } from './ticket-updated-broadcast-rooms';
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
    // Group rooms are joined by membership alone, so a member without staff
    // access to this ticket must never receive internal notes or system
    // events; staff read those in the ticket's staff room after joining it.
    if (payload.assignedGroupId !== null) {
      server.to(groupRoomName(payload.assignedGroupId)).emit(event, payload);
    }
  }
}

export function broadcastTicketUpdated(
  server: Server,
  payload: TicketUpdatedRealtimePayload,
): void {
  const event = ticketRealtimeEventNames.ticketUpdated;
  for (const room of ticketUpdatedBroadcastRooms(payload)) {
    server.to(room).emit(event, payload);
  }
}
