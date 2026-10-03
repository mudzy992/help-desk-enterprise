import { describe, expect, it } from "vitest";
import {
  dashboardChartSections,
  mapAgingBars,
  mapBottleneckBars,
  mapCountBars,
  mapServiceVolumeBars,
  mapWorkloadBars,
  showBottleneckChart,
} from "@/lib/reports/map-report-dashboard-charts";

describe("map-report-dashboard-charts", () => {
  it("ističe najveći razrez kao usko grlo i dodaje sufiks sati", () => {
    const mapped = mapBottleneckBars([
      { key: "g1", label: "Mreža", value: 12 },
      { key: "g2", label: "Aplikacije", value: 4 },
    ]);

    expect(mapped.bottleneckLabel).toBe("Mreža");
    expect(mapped.items[0].suffix).toBe("h");
    expect(mapped.items[0].color).not.toBe(mapped.items[1].color);
  });

  it("bez redova nema oznake uskog grla", () => {
    expect(mapBottleneckBars([])).toEqual({ items: [], bottleneckLabel: null });
    expect(mapServiceVolumeBars([])).toEqual([]);
  });

  it("mapira starenje u četiri korpe, od najsvježije do najstarije", () => {
    const items = mapAgingBars(
      { lessThanOneDay: 3, oneToThreeDays: 2, threeToSevenDays: 1, moreThanSevenDays: 0 },
      { lessThanOneDay: "do 1 dan", oneToThreeDays: "1–3", threeToSevenDays: "3–7", moreThanSevenDays: "> 7" },
    );

    expect(items.map((item) => item.value)).toEqual([3, 2, 1, 0]);
    expect(items[0].label).toBe("do 1 dan");
  });

  it("val 1 (M15/B1): isključena postavka skriva karticu uskih grla, ostalo ostaje", () => {
    expect(showBottleneckChart({ bottlenecksEnabled: true })).toBe(true);
    expect(dashboardChartSections({ bottlenecksEnabled: true })).toEqual([
      "bottleneck",
      "volume",
      "unit",
      "workload",
      "flow",
    ]);

    expect(showBottleneckChart({ bottlenecksEnabled: false })).toBe(false);
    expect(dashboardChartSections({ bottlenecksEnabled: false })).toEqual([
      "volume",
      "unit",
      "workload",
      "flow",
    ]);
  });

  it("val 1 (M15 gap): brojčani razrez nema suffix, a najopterećeniji nosi upozorenje", () => {
    const units = mapCountBars([
      { key: "ou-it", label: "IT", value: 12 },
      { key: "ou-hr", label: "HR", value: 4 },
    ]);
    expect(units.map((item) => item.value)).toEqual([12, 4]);
    expect(units.every((item) => item.suffix === undefined)).toBe(true);

    const workload = mapWorkloadBars([
      { key: "u-1", label: "Amina", value: 5 },
      { key: "u-2", label: "Benjamin", value: 2 },
    ]);
    expect(workload[0].color).not.toBe(workload[1].color);
    expect(workload[0].value).toBe(5);
  });
});
