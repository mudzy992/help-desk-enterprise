import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import {
  describeMergeOrPriorityEvent,
  findLastPriorityOverride,
} from "@/lib/tickets/describe-ticket-activity";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}|${JSON.stringify(options)}` : key) as unknown as TFunction;

function event(body: string, createdAt: string): TicketMessageResponse {
  return {
    id: createdAt,
    ticketId: "t1",
    authorUserId: "u1",
    type: "SYSTEM_EVENT",
    body,
    createdAt,
  } as TicketMessageResponse;
}

describe("describeMergeOrPriorityEvent", () => {
  it("describes a manual priority change with its reason (colons kept)", () => {
    const result = describeMergeOrPriorityEvent("ticket_priority_overridden", "LOW:HIGH:manual:VIP: CEO", t);
    expect(result?.text).toContain("tickets.priority.eventManual");
    expect(result?.note).toBe("VIP: CEO");
  });

  it("describes a reset to the matrix", () => {
    const result = describeMergeOrPriorityEvent("ticket_priority_overridden", "HIGH:LOW:matrix:ok", t);
    expect(result?.text).toContain("tickets.priority.eventReset");
  });

  it("lists merged children on the parent", () => {
    const result = describeMergeOrPriorityEvent("ticket_merged", "HD-1,HD-2:dup", t);
    expect(result?.text).toContain("HD-1, HD-2");
    expect(result?.note).toBe("dup");
  });

  it("ignores unrelated actions and missing details", () => {
    expect(describeMergeOrPriorityEvent("ticket_closed", "x", t)).toBeNull();
    expect(describeMergeOrPriorityEvent("ticket_merged", null, t)).toBeNull();
  });
});

describe("findLastPriorityOverride", () => {
  it("returns the newest manual override", () => {
    const found = findLastPriorityOverride([
      event("ticket_priority_overridden:LOW:MEDIUM:manual:first", "2026-01-01"),
      event("ticket_priority_overridden:MEDIUM:HIGH:manual:second", "2026-01-02"),
    ]);
    expect(found?.reason).toBe("second");
  });

  it("returns null when the newest change was a reset", () => {
    expect(
      findLastPriorityOverride([
        event("ticket_priority_overridden:LOW:HIGH:manual:a", "2026-01-01"),
        event("ticket_priority_overridden:HIGH:LOW:matrix:b", "2026-01-02"),
      ]),
    ).toBeNull();
  });
});
