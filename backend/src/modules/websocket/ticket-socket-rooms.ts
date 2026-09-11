export function ticketRoomName(ticketId: string): string {
  return `ticket:${ticketId}`;
}

export function ticketPublicRoomName(ticketId: string): string {
  return `ticket:${ticketId}:public`;
}

export function ticketStaffRoomName(ticketId: string): string {
  return `ticket:${ticketId}:staff`;
}

export function userRoomName(userId: string): string {
  return `user:${userId}`;
}

export function groupRoomName(groupId: string): string {
  return `group:${groupId}`;
}

export function parseTicketSocketPayload(
  payload: unknown,
): { ticketId: string } | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  if (!('ticketId' in payload) || typeof payload.ticketId !== 'string') {
    return null;
  }
  const ticketId = payload.ticketId.trim();
  return ticketId.length === 0 ? null : { ticketId };
}
