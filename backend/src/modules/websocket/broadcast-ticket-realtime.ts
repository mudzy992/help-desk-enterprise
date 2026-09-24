import type { Server } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import {
  groupFeedChangedEventName,
  isLegacyGroupFullEmitEnabled,
  resolveGroupFeedChange,
  resolveGroupFeedMessage,
  type GroupFeedChangedPayload,
} from './group-feed-change';
import {
  ticketUpdatedBroadcastRooms,
  ticketUpdatedGroupRoom,
} from './ticket-updated-broadcast-rooms';
import { recordWebsocketEmit } from './websocket-emit-counter';
import {
  groupRoomName,
  ticketPublicRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';

/**
 * Phase 3.2 (plan §3.2): the message itself goes to the ticket rooms; the group
 * room gets the light event. The security rule is unchanged and now has one more
 * guarantee: an internal note produces *nothing* for the group room.
 */
export function broadcastTicketMessage(
  server: Server,
  payload: TicketRealtimeMessagePayload,
): void {
  const event = ticketRealtimeEventNames.messageCreated;
  server.to(ticketStaffRoomName(payload.ticketId)).emit(event, payload);
  recordWebsocketEmit('staff');
  if (payload.visibility === 'public') {
    server.to(ticketPublicRoomName(payload.ticketId)).emit(event, payload);
    server.to(userRoomName(payload.requesterId)).emit(event, payload);
    recordWebsocketEmit('public');
    recordWebsocketEmit('user');
    // Group rooms are joined by membership alone, so a member without staff
    // access to this ticket must never receive internal notes or their content.
    broadcastGroupFeed(server, resolveGroupFeedMessage(payload), payload);
  }
}

export function broadcastTicketUpdated(
  server: Server,
  payload: TicketUpdatedRealtimePayload,
): void {
  const event = ticketRealtimeEventNames.ticketUpdated;
  const rooms = ticketUpdatedBroadcastRooms(payload);
  for (const room of rooms) {
    server.to(room).emit(event, payload);
  }
  recordEmitKinds(rooms, payload);
  // One light event per change for the whole group, instead of one full payload
  // per member (and only when the change is not internal-only).
  const groupRoom = ticketUpdatedGroupRoom(payload);
  if (groupRoom === null) {
    return;
  }
  broadcastGroupFeed(
    server,
    resolveGroupFeedChange(payload),
    payload,
    groupRoom,
  );
}

/**
 * One light event for the whole group (instead of one full payload per member).
 * While the transition switch is on, the room also gets the payload shape the
 * previous client build understood, so a rolling deploy loses no event.
 */
function broadcastGroupFeed(
  server: Server,
  groupFeed: GroupFeedChangedPayload | null,
  fullPayload: TicketRealtimeMessagePayload | TicketUpdatedRealtimePayload,
  knownRoom?: string,
): void {
  if (groupFeed === null) {
    return;
  }
  const room = knownRoom ?? groupRoomName(groupFeed.groupId);
  if (isLegacyGroupFullEmitEnabled() && fullPayload.visibility === 'public') {
    const event =
      'body' in fullPayload
        ? ticketRealtimeEventNames.messageCreated
        : ticketRealtimeEventNames.ticketUpdated;
    server.to(room).emit(event, fullPayload);
    recordWebsocketEmit('group');
  }
  server.to(room).emit(groupFeedChangedEventName, groupFeed);
  recordWebsocketEmit('group');
}

function recordEmitKinds(
  rooms: readonly string[],
  payload: TicketUpdatedRealtimePayload,
): void {
  if (rooms.includes(ticketStaffRoomName(payload.ticketId))) {
    recordWebsocketEmit('staff');
  }
  if (rooms.includes(ticketPublicRoomName(payload.ticketId))) {
    recordWebsocketEmit('public');
  }
  for (const room of rooms) {
    if (room.startsWith('user:')) {
      recordWebsocketEmit('user');
    }
  }
}
