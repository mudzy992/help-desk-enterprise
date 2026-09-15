import { describe, expect, it } from "vitest";
import { buildReportKpis } from "@/lib/reports/report-aggregates";
import {
  buildAgingChart,
  buildBottleneckChart,
  buildServiceVolumeItems,
  reportHoursSuffix,
} from "@/lib/reports/report-charts";
import { reportTestTicket as ticket } from "@/lib/reports/report-test-ticket";
import { SEMANTIC_DOT_HEX } from "@/lib/theme/semantic-meta";

const window = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-09-15T23:59:59.999Z"),
};
const previous = {
  from: new Date("2026-08-16T00:00:00.000Z"),
  to: new Date("2026-08-31T23:59:59.999Z"),
};

describe("buildReportKpis", () => {
  it("counts created tickets and averages real duration and CSAT fields", () => {
    const kpis = buildReportKpis(
      [
        ticket("1", "RESOLVED", {
          createdAt: "2026-09-10T08:00:00.000Z",
          resolvedAt: "2026-09-10T14:00:00.000Z",
          sla: sla("2026-09-10T08:26:00.000Z"),
          csat: csat(5),
        }),
        ticket("2", "IN_PROGRESS", {
          createdAt: "2026-09-12T08:00:00.000Z",
          sla: sla("2026-09-12T08:34:00.000Z"),
        }),
        ticket("3", "CLOSED", {
          createdAt: "2026-08-20T08:00:00.000Z",
          resolvedAt: "2026-08-20T10:00:00.000Z",
          csat: csat(4),
        }),
      ],
      window,
      previous,
    );
    expect(kpis.createdCount).toBe(2);
    expect(kpis.firstResponseMinutes).toBe(30);
    expect(kpis.firstResponseSampleCount).toBe(2);
    expect(kpis.resolutionHours).toBe(6);
    expect(kpis.resolutionSampleCount).toBe(1);
    expect(kpis.csatAverage).toBe(5);
    expect(kpis.csatCount).toBe(1);
  });

  it("does not invent averages or percent deltas without samples", () => {
    const kpis = buildReportKpis(
      [ticket("1", "PENDING", { createdAt: "2026-09-10T08:00:00.000Z" })],
      window,
      previous,
    );
    expect(kpis.firstResponseMinutes).toBeNull();
    expect(kpis.resolutionHours).toBeNull();
    expect(kpis.csatAverage).toBeNull();
    expect(kpis.createdDeltaPercent).toBeNull();
  });
});

describe("buildBottleneckChart", () => {
  it("uses resolution hours and warning color only on the max bar", () => {
    const chart = buildBottleneckChart(
      [
        ticket("1", "RESOLVED", {
          assignedGroupId: "finance",
          createdAt: "2026-09-10T08:00:00.000Z",
          resolvedAt: "2026-09-10T19:12:00.000Z",
        }),
        ticket("2", "RESOLVED", {
          assignedGroupId: "it",
          createdAt: "2026-09-10T08:00:00.000Z",
          resolvedAt: "2026-09-10T10:18:00.000Z",
        }),
      ],
      window,
      new Map([
        ["finance", "Finansijski Servisi"],
        ["it", "IT Podrška L1"],
      ]),
      "Neusmjereni",
    );
    expect(chart.bottleneckLabel).toBe("Finansijski Servisi");
    expect(chart.items[0]).toMatchObject({
      label: "Finansijski Servisi",
      value: 11.2,
      suffix: reportHoursSuffix,
      color: SEMANTIC_DOT_HEX.warning,
    });
    expect(chart.items[1]).toMatchObject({
      label: "IT Podrška L1",
      value: 2.3,
      suffix: reportHoursSuffix,
      color: SEMANTIC_DOT_HEX.primary,
    });
  });
});

describe("buildServiceVolumeItems", () => {
  it("counts created tickets per service inside the window", () => {
    const items = buildServiceVolumeItems(
      [
        ticket("1", "PENDING", { serviceId: "svc-a" }),
        ticket("2", "PENDING", {
          serviceId: "svc-a",
          createdAt: "2026-09-11T08:00:00.000Z",
        }),
        ticket("3", "PENDING", {
          serviceId: "svc-b",
          createdAt: "2026-09-11T08:00:00.000Z",
        }),
        ticket("4", "PENDING", {
          serviceId: "svc-b",
          createdAt: "2026-08-01T08:00:00.000Z",
        }),
      ],
      window,
      new Map([
        ["svc-a", "Incident"],
        ["svc-b", "VPN"],
      ]),
    );
    expect(items).toEqual([
      { label: "Incident", value: 2, color: SEMANTIC_DOT_HEX.primary },
      { label: "VPN", value: 1, color: SEMANTIC_DOT_HEX.primary },
    ]);
  });
});

describe("buildAgingChart", () => {
  it("buckets open tickets by createdAt age and counts waiting over 7 days", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const chart = buildAgingChart(
      [
        ticket("1", "PENDING", { createdAt: "2026-09-15T08:00:00.000Z" }),
        ticket("2", "IN_PROGRESS", { createdAt: "2026-09-13T08:00:00.000Z" }),
        ticket("3", "WAITING_FOR_USER", { createdAt: "2026-09-01T08:00:00.000Z" }),
        ticket("4", "RESOLVED", { createdAt: "2026-09-01T08:00:00.000Z" }),
      ],
      now,
      {
        lessThanOneDay: "< 1 dan",
        oneToThreeDays: "1–3 dana",
        threeToSevenDays: "3–7 dana",
        moreThanSevenDays: "> 7 dana",
      },
    );
    expect(chart.items.map((item) => item.value)).toEqual([1, 1, 0, 1]);
    expect(chart.waitingOverSevenDays).toBe(1);
    expect(chart.items[0]?.color).toBe(SEMANTIC_DOT_HEX.success);
    expect(chart.items[3]?.color).toBe(SEMANTIC_DOT_HEX.danger);
  });
});

function sla(respondedAt: string) {
  return {
    startedAt: "2026-09-10T08:00:00.000Z",
    responseDueAt: null,
    resolutionDueAt: null,
    respondedAt,
    resolutionCompletedAt: null,
    pausedAt: null,
    isResponseBreached: false,
    isResolutionBreached: false,
  };
}

function csat(rating: number) {
  return {
    enabled: true,
    canSubmit: false,
    submitted: true,
    rating,
    comment: null,
    scaleMax: 5,
    askOnResolved: true,
    askOnClosed: true,
  };
}
