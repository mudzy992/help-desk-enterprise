import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import {
  incidentDurationMinutes,
  localizedIncidentTitle,
  mapStatusError,
  nextIncidentStatuses,
  overallStatus,
  parseIncidentEventDetail,
  splitDuration,
} from "@/lib/status/status-view";

describe("status view (Paket 2.7)", () => {
  it("overall status: outage > degraded > maintenance", () => {
    expect(overallStatus([], 0)).toBe("operational");
    expect(overallStatus([], 2)).toBe("partial");
    expect(overallStatus([{ impact: "MAINTENANCE" }], 1)).toBe("maintenance");
    expect(overallStatus([{ impact: "MAINTENANCE" }, { impact: "DEGRADED" }], 1)).toBe("partial");
    expect(overallStatus([{ impact: "DEGRADED" }, { impact: "DOWN" }], 1)).toBe("major");
  });

  it("offers forward statuses only", () => {
    expect(nextIncidentStatuses("INVESTIGATING")).toEqual(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]);
    expect(nextIncidentStatuses("MONITORING")).toEqual(["MONITORING", "RESOLVED"]);
    expect(nextIncidentStatuses("RESOLVED")).toEqual([]);
  });

  it("uses the English title only when present", () => {
    expect(localizedIncidentTitle({ title: "Prekid", titleEn: "Outage" }, "en")).toBe("Outage");
    expect(localizedIncidentTitle({ title: "Prekid", titleEn: null }, "en")).toBe("Prekid");
    expect(localizedIncidentTitle({ title: "Prekid", titleEn: "Outage" }, "bs")).toBe("Prekid");
  });

  it("computes durations", () => {
    const start = "2026-01-01T10:00:00.000Z";
    expect(incidentDurationMinutes({ startedAt: start, resolvedAt: "2026-01-01T11:20:00.000Z" }, 0)).toBe(80);
    expect(incidentDurationMinutes({ startedAt: start, resolvedAt: null }, Date.parse(start) + 5 * 60_000)).toBe(5);
    expect(splitDuration(1530)).toEqual({ days: 1, hours: 1, minutes: 30 });
  });

  it("parses the ticket event detail", () => {
    expect(parseIncidentEventDetail("abc|VPN: prekid")).toEqual({ incidentId: "abc", title: "VPN: prekid" });
    expect(parseIncidentEventDetail("broken")).toBeNull();
    expect(parseIncidentEventDetail(null)).toBeNull();
  });

  it("maps known incident error codes", () => {
    expect(mapStatusError(new ApiError(409, "INCIDENT_CHANGED", "x"))).toBe("status.errors.changed");
    expect(mapStatusError(new ApiError(409, "OTHER", "x"))).toBeNull();
    expect(mapStatusError(new Error("x"))).toBeNull();
  });
});
