import { describe, expect, it } from "vitest";
import { queryKeysForTicketEvent } from "@/lib/realtime/invalidate-on-event";
import { queryKeys } from "@/lib/query/query-keys";

/**
 * The dashboard key carries a day, so what an event invalidates is its prefix —
 * which is what these expectations pin down.
 */
describe("queryKeysForTicketEvent", () => {
  it("invalidates the list, the detail and the dashboard on a ticket update", () => {
    expect(
      queryKeysForTicketEvent({
        eventName: "ticket.updated",
        payload: { ticketId: "ticket-1" },
      }),
    ).toEqual([
      queryKeys.ticketLists,
      queryKeys.ticket("ticket-1"),
      queryKeys.dashboardSummaryPrefix("all"),
      queryKeys.slaSummary,
    ]);
  });

  it("keeps a group feed change to the list queries", () => {
    expect(
      queryKeysForTicketEvent({
        eventName: "group.feed-changed",
        payload: { groupId: "group-it", ticketId: "ticket-1", kind: "message" },
      }),
    ).toEqual([queryKeys.ticketLists]);
  });

  it("invalidates notifications on their own events", () => {
    expect(
      queryKeysForTicketEvent({
        eventName: "notification.created",
        payload: { ticketId: "ticket-1" },
      }),
    ).toEqual([queryKeys.notifications]);
  });

  it("does not throw on a payload without a ticket id", () => {
    expect(
      queryKeysForTicketEvent({ eventName: "ticket.updated", payload: null }),
    ).toEqual([
      queryKeys.ticketLists,
      queryKeys.dashboardSummaryPrefix("all"),
      queryKeys.slaSummary,
    ]);
    expect(
      queryKeysForTicketEvent({ eventName: "group.feed-changed", payload: {} }),
    ).toEqual([]);
  });

  it("ignores events it does not know", () => {
    expect(
      queryKeysForTicketEvent({ eventName: "settings.updated", payload: {} }),
    ).toEqual([]);
  });
});
