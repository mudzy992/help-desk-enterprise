import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';
import {
  groupRoomName,
  ticketPublicRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';

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
  if (payload.assignedGroupId !== null && payload.assignedGroupId.length > 0) {
    rooms.add(groupRoomName(payload.assignedGroupId));
  }
  return [...rooms];
}

function addUserRoom(rooms: Set<string>, userId: string | null): void {
  if (userId !== null && userId.length > 0) {
    rooms.add(userRoomName(userId));
  }
}
