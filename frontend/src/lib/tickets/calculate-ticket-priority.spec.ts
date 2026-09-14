import { describe, expect, it } from "vitest";
import { calculateTicketPriority } from "@/lib/tickets/calculate-ticket-priority";

describe("calculateTicketPriority", () => {
  it("uses the same impact + urgency score bands as the backend", () => {
    expect(calculateTicketPriority("LOW", "LOW")).toBe("LOW");
    expect(calculateTicketPriority("LOW", "MEDIUM")).toBe("MEDIUM");
    expect(calculateTicketPriority("MEDIUM", "MEDIUM")).toBe("MEDIUM");
    expect(calculateTicketPriority("MEDIUM", "HIGH")).toBe("HIGH");
    expect(calculateTicketPriority("HIGH", "HIGH")).toBe("HIGH");
    expect(calculateTicketPriority("HIGH", "CRITICAL")).toBe("CRITICAL");
  });
});
