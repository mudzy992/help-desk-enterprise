import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import {
  groupRoomName,
  ticketPublicRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';

/**
 * Phase 3.2 (plan §3.2): the group room is **not** in this set any more. A group
 * room carries every ticket of every member, so the full payload there was the
 * single biggest source of socket traffic; it now receives `groupFeedChanged`
 * (see `group-feed-change.ts`) instead.
 */
export function ticketUpdatedBroadcastRooms(
  payload: TicketUpdatedRealtimePayload,
): readonly string[] {
  const rooms = new Set<string>([ticketStaffRoomName(payload.ticketId)]);
  if (payload.visibility === 'public') {
    rooms.add(ticketPublicRoomName(payload.ticketId));
    addUserRoom(rooms, payload.requesterId);
  }
  addUserRoom(rooms, payload.assignedUserId);
  addUserRoom(rooms, payload.actorUserId);
  return [...rooms];
}

/** The room that gets the light `groupFeedChanged` event for this change. */
export function ticketUpdatedGroupRoom(
  payload: TicketUpdatedRealtimePayload,
): string | null {
  if (payload.assignedGroupId === null || payload.assignedGroupId.length === 0) {
    return null;
  }
  return groupRoomName(payload.assignedGroupId);
}

function addUserRoom(rooms: Set<string>, userId: string | null): void {
  if (userId !== null && userId.length > 0) {
    rooms.add(userRoomName(userId));
  }
}
