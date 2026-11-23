import type { DashboardSummaryResponse } from "./report-summary.types";
import {
  parseDashboardSummaryResponse,
  parseSlaSummaryResponse,
} from "./parse-report-summary-cache";

const dashboardPayload: DashboardSummaryResponse = {
  generatedAt: "2026-09-24T10:00:00.000Z",
  volume14d: Array.from({ length: 14 }, (_, index) => ({
    date: `2026-09-${String(index + 11).padStart(2, "0")}`,
    created: 0,
    resolved: 0,
  })),
  total: 1,
  open: 1,
  critical: 0,
  overdue: 0,
  openedToday: 1,
  waitingForUser: 0,
  pendingApproval: 0,
  resolved: 0,
  closed: 0,
  unrouted: 0,
  unassigned: 0,
  assignedToMe: 0,
  requestedByMe: 1,
  statusCounts: [{ status: "PENDING", count: 1 }],
  priorityCounts: [{ priority: "LOW", count: 1 }],
};

describe("parseDashboardSummaryResponse", () => {
  it("accepts a payload written by this build", () => {
    expect(parseDashboardSummaryResponse(dashboardPayload)).toEqual(
      dashboardPayload,
    );
  });

  it.each([
    ["not an object", "nope"],
    ["an array instead of a record", []],
    ["missing counter", { ...dashboardPayload, overdue: undefined }],
    ["counter as string", { ...dashboardPayload, total: "4" }],
    ["statusCounts not an array", { ...dashboardPayload, statusCounts: null }],
    // W7.105 (BA-reports-15): a counter counts rows, so a fraction, a negative number and an unparsable timestamp
    // are all rejected — the old check accepted every one of them.
    ["fractional counter", { ...dashboardPayload, total: 1.5 }],
    ["negative counter", { ...dashboardPayload, open: -1 }],
    ["generatedAt that does not parse", { ...dashboardPayload, generatedAt: "not a date" }],
    [
      "status entry without a name",
      { ...dashboardPayload, statusCounts: [{ count: 1 }] },
    ],
    [
      "status entry with a negative count",
      { ...dashboardPayload, statusCounts: [{ status: "PENDING", count: -3 }] },
    ],
    [
      "priority entry that is not an object",
      { ...dashboardPayload, priorityCounts: ["LOW"] },
    ],
    [
      "a volume day that is not an object",
      { ...dashboardPayload, volume14d: Array.from({ length: 14 }, () => null) },
    ],
    [
      "a volume day with a broken date",
      {
        ...dashboardPayload,
        volume14d: dashboardPayload.volume14d.map((day) => ({ ...day, date: "x" })),
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(parseDashboardSummaryResponse(value)).toBeNull();
  });

  it("rejects a collection over the per-payload cap without validating it", () => {
    const tooMany = Array.from({ length: 5_001 }, () => ({
      status: "PENDING",
      count: 1,
    }));
    expect(
      parseDashboardSummaryResponse({ ...dashboardPayload, statusCounts: tooMany }),
    ).toBeNull();
  });

  it("rejects infinity, as a cached number can carry it", () => {
    expect(
      parseDashboardSummaryResponse({ ...dashboardPayload, total: Infinity }),
    ).toBeNull();
  });
});

describe("parseSlaSummaryResponse", () => {
  const slaPayload = {
    generatedAt: "2026-09-24T10:00:00.000Z",
    totals: { open: 2, onTrack: 1, atRisk: 1, breached: 0 },
    profiles: [
      {
        slaProfileId: "profile-standard",
        exposure: { open: 2, onTrack: 1, atRisk: 1, breached: 0 },
        priorities: [
          {
            priority: "HIGH",
            exposure: { open: 2, onTrack: 1, atRisk: 1, breached: 0 },
          },
        ],
      },
    ],
  };

  it("accepts a payload written by this build", () => {
    expect(parseSlaSummaryResponse(slaPayload)).toEqual(slaPayload);
  });

  it.each([
    ["missing generatedAt", { ...slaPayload, generatedAt: 5 }],
    ["broken totals", { ...slaPayload, totals: { open: 2 } }],
    ["profiles not an array", { ...slaPayload, profiles: {} }],
    [
      "profile without an id",
      {
        ...slaPayload,
        profiles: [{ exposure: slaPayload.totals, priorities: [] }],
      },
    ],
    [
      "profile with a broken exposure",
      {
        ...slaPayload,
        profiles: [
          { slaProfileId: "p", exposure: { open: 1 }, priorities: [] },
        ],
      },
    ],
    [
      "profile with a fractional exposure",
      {
        ...slaPayload,
        profiles: [
          {
            slaProfileId: "p",
            exposure: { open: 0.5, onTrack: 0, atRisk: 0, breached: 0 },
            priorities: [],
          },
        ],
      },
    ],
    [
      "priority without an exposure",
      {
        ...slaPayload,
        profiles: [
          {
            slaProfileId: "p",
            exposure: slaPayload.totals,
            priorities: [{ priority: "HIGH" }],
          },
        ],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(parseSlaSummaryResponse(value)).toBeNull();
  });
});
