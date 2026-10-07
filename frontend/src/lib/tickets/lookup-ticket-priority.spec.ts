import { describe, expect, it } from "vitest";
import { lookupTicketPriority } from "@/lib/tickets/lookup-ticket-priority";

describe("lookupTicketPriority", () => {
  it("prefers matrix cells over the score-band fallback", () => {
    expect(
      lookupTicketPriority("HIGH", "HIGH", [
        {
          id: "1",
          impact: "HIGH",
          urgency: "HIGH",
          priority: "CRITICAL",
        },
      ]),
    ).toBe("CRITICAL");
  });

  it("returns a stable MEDIUM placeholder before the backend matrix is loaded", () => {
    expect(lookupTicketPriority("HIGH", "HIGH", null)).toBe("MEDIUM");
  });
});
