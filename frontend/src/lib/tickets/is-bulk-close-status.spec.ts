import { describe, expect, it } from "vitest";
import { isBulkCloseStatus } from "@/lib/tickets/is-bulk-close-status";

describe("isBulkCloseStatus", () => {
  it("blocks close and archive only", () => {
    expect(isBulkCloseStatus("CLOSED")).toBe(true);
    expect(isBulkCloseStatus("ARCHIVED")).toBe(true);
    expect(isBulkCloseStatus("RESOLVED")).toBe(false);
    expect(isBulkCloseStatus("IN_PROGRESS")).toBe(false);
  });
});
