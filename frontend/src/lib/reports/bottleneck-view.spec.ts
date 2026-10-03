import { describe, expect, it } from "vitest";
import {
  bottleneckBreakdownBars,
  bottleneckCounterKeys,
  bottleneckTotal,
  bottleneckTrendRows,
} from "@/lib/reports/bottleneck-view";
import type { BottleneckBreakdownRow, BottleneckTrendRow } from "@/services/reports-api";

function row(key: string, counts: Partial<BottleneckBreakdownRow> = {}): BottleneckBreakdownRow {
  return {
    key,
    pendingApproval: 0,
    waitingForUser: 0,
    unrouted: 0,
    overdue: 0,
    ...counts,
  };
}

describe("bottleneck-view (val 1, M15/B2)", () => {
  it("sabira sva četiri brojača u ukupan zastoj", () => {
    expect(bottleneckCounterKeys).toEqual([
      "pendingApproval",
      "waitingForUser",
      "unrouted",
      "overdue",
    ]);
    expect(bottleneckTotal(row("x", { pendingApproval: 1, waitingForUser: 2, unrouted: 3, overdue: 4 }))).toBe(10);
    expect(bottleneckTotal(row("x"))).toBe(0);
  });

  it("sortira razrez opadajuće, a jednake vrijednosti po nazivu", () => {
    const bars = bottleneckBreakdownBars([
      row("Servis B", { overdue: 2 }),
      row("Servis A", { overdue: 2 }),
      row("Servis C", { unrouted: 9 }),
    ]);

    expect(bars.map((bar) => bar.label)).toEqual(["Servis C", "Servis A", "Servis B"]);
    expect(bars.map((bar) => bar.value)).toEqual([9, 2, 2]);
  });

  it("iz trenda izbacuje dane bez ijednog događaja", () => {
    const trend: readonly BottleneckTrendRow[] = [
      { date: "2026-09-01", createdCount: 0, pendingApproval: 0, waitingForUser: 0, unrouted: 0, overdue: 0 },
      { date: "2026-09-02", createdCount: 3, pendingApproval: 0, waitingForUser: 0, unrouted: 0, overdue: 0 },
      { date: "2026-09-03", createdCount: 0, pendingApproval: 0, waitingForUser: 0, unrouted: 0, overdue: 1 },
    ];

    expect(bottleneckTrendRows(trend).map((entry) => entry.date)).toEqual([
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("prazan razrez daje prazne trake (bez izmišljenih redova)", () => {
    expect(bottleneckBreakdownBars([])).toEqual([]);
    expect(bottleneckTrendRows([])).toEqual([]);
  });
});
