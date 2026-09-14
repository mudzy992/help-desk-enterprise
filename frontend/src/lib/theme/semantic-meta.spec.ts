import { describe, expect, it } from "vitest";
import {
  ROUTING_OUTCOME_META,
  SERVICE_AVAILABILITY_META,
  SLA_STATE_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
} from "@/lib/theme/semantic-meta";

describe("semantic-meta", () => {
  it("maps extra ticket statuses that the reference core does not have", () => {
    expect(TICKET_STATUS_META.UNROUTED.tone).toBe("danger");
    expect(TICKET_STATUS_META.PENDING_APPROVAL.tone).toBe("warning");
    expect(TICKET_STATUS_META.ARCHIVED.tone).toBe("neutral");
  });

  it("maps OPERATIONAL to success (AVAILABLE / Dostupno)", () => {
    expect(SERVICE_AVAILABILITY_META.OPERATIONAL.tone).toBe("success");
  });

  it("keeps reference tones for priority, routing, and SLA", () => {
    expect(TICKET_PRIORITY_META.CRITICAL.tone).toBe("danger");
    expect(ROUTING_OUTCOME_META.UNROUTED.tone).toBe("danger");
    expect(SLA_STATE_META.BREACHED.tone).toBe("danger");
  });
});
