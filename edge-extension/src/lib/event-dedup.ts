const seenEventIds = new Set<string>();
const seenOrder: string[] = [];
const ticketIdByEventId = new Map<string, string | null>();
const maximumTrackedEvents = 500;

export function rememberEventId(eventId: string, dedupEnabled: boolean): boolean {
  if (!dedupEnabled) {
    ticketIdByEventId.set(eventId, ticketIdByEventId.get(eventId) ?? null);
    return true;
  }
  const id = eventId.trim();
  if (id.length === 0 || seenEventIds.has(id)) {
    return false;
  }
  seenEventIds.add(id);
  seenOrder.push(id);
  if (seenOrder.length > maximumTrackedEvents) {
    const oldest = seenOrder.shift();
    if (oldest !== undefined) {
      seenEventIds.delete(oldest);
      ticketIdByEventId.delete(oldest);
    }
  }
  return true;
}

export function rememberTicketForEvent(
  eventId: string,
  ticketId: string | null,
): void {
  ticketIdByEventId.set(eventId, ticketId);
}

export function ticketIdForEvent(eventId: string): string | null {
  return ticketIdByEventId.get(eventId) ?? null;
}

export function resetEventDedup(): void {
  seenEventIds.clear();
  seenOrder.splice(0, seenOrder.length);
  ticketIdByEventId.clear();
}
