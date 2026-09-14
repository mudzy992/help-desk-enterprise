import { describe, expect, it } from "vitest";
import { mapTicketSlaPanel } from "@/lib/tickets/map-ticket-sla-panel";
import type { TicketSlaSnapshot } from "@/services/tickets-api";

const now = new Date("2026-09-14T12:00:00.000Z");

function snapshot(overrides: Partial<TicketSlaSnapshot> = {}): TicketSlaSnapshot {
  return {
    startedAt: "2026-09-14T10:00:00.000Z",
    responseDueAt: "2026-09-14T14:00:00.000Z",
    resolutionDueAt: "2026-09-14T18:00:00.000Z",
    respondedAt: null,
    resolutionCompletedAt: null,
    pausedAt: null,
    isResponseBreached: false,
    isResolutionBreached: false,
    ...overrides,
  };
}

describe("mapTicketSlaPanel", () => {
  it("hides the panel when no SLA snapshot exists", () => {
    expect(mapTicketSlaPanel(null, now)).toBeNull();
    expect(mapTicketSlaPanel(undefined, now)).toBeNull();
  });

  it("keeps a satisfied response green after the due time has passed", () => {
    const view = mapTicketSlaPanel(
      snapshot({
        respondedAt: "2026-09-14T11:00:00.000Z",
        responseDueAt: "2026-09-14T11:30:00.000Z",
        isResolutionBreached: true,
        resolutionDueAt: "2026-09-14T11:00:00.000Z",
      }),
      now,
    );
    expect(view?.response.satisfied).toBe(true);
    expect(view?.response.overdue).toBe(false);
    expect(view?.response.tone).toBe("success");
    expect(view?.response.usedPercent).toBe(100);
    expect(view?.resolution.overdue).toBe(true);
    expect(view?.resolution.tone).toBe("danger");
    expect(view?.state).toBe("BREACHED");
  });

  it("maps pause to a frozen warning chip and does not keep ticking", () => {
    const view = mapTicketSlaPanel(
      snapshot({
        pausedAt: "2026-09-14T11:00:00.000Z",
        responseDueAt: "2026-09-14T12:00:00.000Z",
      }),
      now,
    );
    expect(view?.response.paused).toBe(true);
    expect(view?.resolution.paused).toBe(true);
    expect(view?.response.overdue).toBe(false);
    expect(view?.response.usedPercent).toBe(50);
  });

  it("maps a live breach to danger remaining time", () => {
    const view = mapTicketSlaPanel(
      snapshot({
        responseDueAt: "2026-09-14T11:00:00.000Z",
        isResponseBreached: true,
      }),
      now,
    );
    expect(view?.response.satisfied).toBe(false);
    expect(view?.response.overdue).toBe(true);
    expect(view?.response.tone).toBe("danger");
    expect(view?.state).toBe("BREACHED");
  });
});
