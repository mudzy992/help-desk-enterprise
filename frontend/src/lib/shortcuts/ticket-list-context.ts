/**
 * Paket 2.8 §4.1 "next ticket": the list saves the order of the ticket ids on
 * the current page (ids only, no content, max 500) in sessionStorage; the
 * detail page moves to the neighbour with `]` / `[`.
 */
export interface TicketListContext {
  readonly ids: readonly string[];
  /** Pathname + search of the list, for "back to list" (U). */
  readonly listUrl: string;
}

export const TICKET_LIST_CONTEXT_KEY = "helpdesk.ticketListContext";
const MAX_IDS = 500;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveTicketListContext(context: TicketListContext, target: StorageLike | null = storage()): void {
  if (target === null) return;
  try {
    target.setItem(
      TICKET_LIST_CONTEXT_KEY,
      JSON.stringify({ ids: context.ids.slice(0, MAX_IDS), listUrl: context.listUrl }),
    );
  } catch {
    // Storage full or blocked: the shortcut then reports "no list".
  }
}

export function readTicketListContext(source: StorageLike | null = storage()): TicketListContext | null {
  if (source === null) return null;
  try {
    const raw = source.getItem(TICKET_LIST_CONTEXT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { ids?: unknown }).ids) ||
      typeof (parsed as { listUrl?: unknown }).listUrl !== "string"
    ) {
      return null;
    }
    const ids = ((parsed as { ids: unknown[] }).ids).filter((id): id is string => typeof id === "string");
    const listUrl = (parsed as { listUrl: string }).listUrl;
    // Only same-app relative paths are accepted (no open redirect through storage).
    if (!listUrl.startsWith("/") || listUrl.startsWith("//")) return null;
    return { ids, listUrl };
  } catch {
    return null;
  }
}

export type AdjacentTicket =
  | { readonly kind: "ticket"; readonly id: string }
  | { readonly kind: "edge" }
  | { readonly kind: "no-context" };

export function adjacentTicket(
  context: TicketListContext | null,
  currentId: string,
  direction: 1 | -1,
): AdjacentTicket {
  if (context === null) return { kind: "no-context" };
  const index = context.ids.indexOf(currentId);
  if (index < 0) return { kind: "no-context" };
  const next = context.ids[index + direction];
  return next === undefined ? { kind: "edge" } : { kind: "ticket", id: next };
}
