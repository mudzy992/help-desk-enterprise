import { describe, expect, it } from "vitest";
import {
  buildSlaExposureIndex,
  emptySlaExposure,
} from "@/lib/sla/sla-exposure-index";
import type { SlaSummaryResponse } from "@/services/report-summary-api";

const summary: SlaSummaryResponse = {
  generatedAt: "2026-09-24T10:00:00.000Z",
  totals: { open: 5, onTrack: 3, atRisk: 1, breached: 1 },
  profiles: [
    {
      slaProfileId: "profile-standard",
      exposure: { open: 4, onTrack: 2, atRisk: 1, breached: 1 },
      priorities: [
        {
          priority: "HIGH",
          exposure: { open: 4, onTrack: 2, atRisk: 1, breached: 1 },
        },
      ],
    },
  ],
};

describe("buildSlaExposureIndex", () => {
  it("answers the per-profile open count from the aggregate", () => {
    const index = buildSlaExposureIndex(summary);
    expect(index.openCount("profile-standard")).toBe(4);
    expect(index.totals).toEqual({ open: 5, onTrack: 3, atRisk: 1, breached: 1 });
  });

  it("answers the exposure of a profile and priority", () => {
    const index = buildSlaExposureIndex(summary);
    expect(index.exposure("profile-standard", "HIGH")).toEqual({
      open: 4,
      onTrack: 2,
      atRisk: 1,
      breached: 1,
    });
  });

  it("counts zero for a profile or priority the aggregate does not know", () => {
    const index = buildSlaExposureIndex(summary);
    expect(index.exposure("profile-standard", "LOW")).toEqual(emptySlaExposure);
    expect(index.exposure("profile-other", "HIGH")).toEqual(emptySlaExposure);
    expect(index.openCount("profile-other")).toBe(0);
  });

  it("survives a failed load", () => {
    const index = buildSlaExposureIndex(null);
    expect(index.totals).toEqual(emptySlaExposure);
    expect(index.openCount("profile-standard")).toBe(0);
    expect(index.exposure("profile-standard", "HIGH")).toEqual(emptySlaExposure);
  });
});
