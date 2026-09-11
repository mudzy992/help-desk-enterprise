import { describe, expect, it } from "vitest";
import { isResolveOrCloseStatus } from "@/lib/tickets/is-resolve-or-close-status";

describe("isResolveOrCloseStatus", () => {
  it("identifies resolve and close statuses", () => {
    expect(isResolveOrCloseStatus("RESOLVED")).toBe(true);
    expect(isResolveOrCloseStatus("CLOSED")).toBe(true);
    expect(isResolveOrCloseStatus("IN_PROGRESS")).toBe(false);
  });
});
