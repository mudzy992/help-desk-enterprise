/**
 * Dedup + mapiranje eventa.
 *
 * Isti `eventId` stiže i preko WS-a (`notification.created`) i preko
 * EDGE_EVENT queue / pollinga — klijent smije prikazati samo jedan toast.
 * Uz dedup pamtimo i `eventId → { ticketId, notificationId }` mapu jer je
 * chrome notification id jednak eventId-u, a `opened` receipt mora nositi
 * stvarni `notification.id` (inače backend odgovara 404).
 */
const maximumTrackedEvents = 500;

type EventMeta = {
  readonly ticketId: string | null;
  readonly notificationId: string;
};

const seenEventIds = new Set<string>();
const seenOrder: string[] = [];
const metaByEventId = new Map<string, EventMeta>();

/** true = novi event (smije se obraditi); false = duplikat, prekini. */
export function rememberEventId(eventId: string, dedupEnabled: boolean): boolean {
  const id = eventId.trim();
  if (id.length === 0) {
    return false;
  }
  if (!dedupEnabled) {
    return true;
  }
  if (seenEventIds.has(id)) {
    return false;
  }
  seenEventIds.add(id);
  seenOrder.push(id);
  if (seenOrder.length > maximumTrackedEvents) {
    const oldest = seenOrder.shift();
    if (oldest !== undefined) {
      seenEventIds.delete(oldest);
      metaByEventId.delete(oldest);
    }
  }
  return true;
}

export function rememberEventMeta(
  eventId: string,
  ticketId: string | null,
  notificationId: string,
): void {
  const id = eventId.trim();
  if (id.length === 0) {
    return;
  }
  metaByEventId.set(id, { ticketId, notificationId });
}

export function eventMetaFor(
  eventId: string,
): { readonly ticketId: string | null; readonly notificationId: string } | null {
  return metaByEventId.get(eventId) ?? null;
}

export function ticketIdForEvent(eventId: string): string | null {
  return metaByEventId.get(eventId)?.ticketId ?? null;
}

export function resetEventDedup(): void {
  seenEventIds.clear();
  seenOrder.splice(0, seenOrder.length);
  metaByEventId.clear();
}
