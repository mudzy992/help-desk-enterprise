import { describe, expect, it } from "vitest";
import {
  isGroupFeedChangedPayload,
  type GroupFeedChangedPayload,
} from "@/lib/realtime/group-feed-changed";

const validPayload: GroupFeedChangedPayload = {
  groupId: "group-it",
  ticketId: "ticket-1",
  kind: "message",
  occurredAt: "2026-09-24T08:00:00.000Z",
};

describe("isGroupFeedChangedPayload", () => {
  it("accepts the light event shape", () => {
    expect(isGroupFeedChangedPayload(validPayload)).toBe(true);
    expect(isGroupFeedChangedPayload({ ...validPayload, kind: "sla" })).toBe(true);
  });

  it("rejects payloads that would carry ticket content", () => {
    expect(isGroupFeedChangedPayload(null)).toBe(false);
    expect(isGroupFeedChangedPayload("group.feed-changed")).toBe(false);
    expect(isGroupFeedChangedPayload({ ...validPayload, kind: "internal" })).toBe(false);
    expect(isGroupFeedChangedPayload({ ...validPayload, ticketId: undefined })).toBe(false);
  });

  it("stays under 200 bytes on the wire", () => {
    expect(JSON.stringify(validPayload).length).toBeLessThan(200);
  });
});
