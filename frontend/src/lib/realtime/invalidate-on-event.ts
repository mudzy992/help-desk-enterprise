import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { ticketSocketEvents } from "@/services/ticket-socket";
import type { Socket } from "socket.io-client";

export type QueryKey = readonly unknown[];

/**
 * Faza 3.3 (plan §3.3, item 3): the single place that maps a socket event to the
 * queries it invalidates. Kept pure so the mapping itself is testable — the
 * subscription below is the only part that touches the socket.
 *
 * `group.feed-changed` (Faza 3.2) intentionally invalidates only the list
 * queries: the group room never carried the ticket content, so there is nothing
 * to update in a ticket detail cache.
 *
 * The dashboard key carries a day, so the invalidation uses its prefix: an
 * event drops today's counters without having to know which day is on screen.
 */
const QUERY_KEYS_DASHBOARD_SUMMARY = queryKeys.dashboardSummaryPrefix("all");
export function queryKeysForTicketEvent(input: {
  readonly eventName: string;
  readonly payload: unknown;
}): readonly QueryKey[] {
  const ticketId = readTicketId(input.payload);
  switch (input.eventName) {
    case ticketSocketEvents.ticketUpdated:
      return ticketId === null
        ? [
            queryKeys.ticketLists,
            QUERY_KEYS_DASHBOARD_SUMMARY,
            queryKeys.slaSummary,
          ]
        : [
            queryKeys.ticketLists,
            queryKeys.ticket(ticketId),
            QUERY_KEYS_DASHBOARD_SUMMARY,
            queryKeys.slaSummary,
          ];
    case ticketSocketEvents.messageCreated:
      return ticketId === null
        ? [queryKeys.ticketLists]
        : [queryKeys.ticketLists, queryKeys.ticket(ticketId)];
    case ticketSocketEvents.groupFeedChanged:
      // Only "something changed in your group" — pull the lists, not the detail.
      return ticketId === null ? [] : [queryKeys.ticketLists];
    case ticketSocketEvents.notificationCreated:
    case ticketSocketEvents.notificationRead:
      return [queryKeys.notifications];
    default:
      return [];
  }
}

export type QueryInvalidationOptions = {
  readonly socket: Socket;
  readonly queryClient: QueryClient;
  /** Screens that are not on screen must not pull anything (plan §3.2/§3.3). */
  readonly isScreenVisible?: () => boolean;
};

export function subscribeToQueryInvalidation(
  options: QueryInvalidationOptions,
): () => void {
  const isVisible =
    options.isScreenVisible ??
    (() =>
      typeof document === "undefined" || document.visibilityState === "visible");
  const watched = [
    ticketSocketEvents.ticketUpdated,
    ticketSocketEvents.messageCreated,
    ticketSocketEvents.groupFeedChanged,
    ticketSocketEvents.notificationCreated,
    ticketSocketEvents.notificationRead,
  ];
  const stops = watched.map((eventName) =>
    subscribeSocketEvent<unknown>(options.socket, eventName, (payload) => {
      if (!isVisible()) {
        return;
      }
      for (const key of queryKeysForTicketEvent({ eventName, payload })) {
        void options.queryClient.invalidateQueries({ queryKey: key });
      }
    }),
  );
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

function readTicketId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const ticketId = (payload as { readonly ticketId?: unknown }).ticketId;
  return typeof ticketId === "string" && ticketId.length > 0 ? ticketId : null;
}
