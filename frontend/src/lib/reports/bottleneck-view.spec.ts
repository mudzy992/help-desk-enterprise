import { describe, expect, it } from "vitest";
import {
  bottleneckBreakdownBars,
  bottleneckCounterKeys,
  bottleneckTotal,
  bottleneckTrendRows,
} from "@/lib/reports/bottleneck-view";
import type { BottleneckBreakdownRow, BottleneckTrendRow } from "@/services/reports-api";

function row(
  key: string,
  counts: Partial<BottleneckBreakdownRow> = {},
): BottleneckBreakdownRow {
  return {
    key,
    label: counts.label ?? key,
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
      row("svc-b", { label: "Servis B", overdue: 2 }),
      row("svc-a", { label: "Servis A", overdue: 2 }),
      row("svc-c", { label: "Servis C", unrouted: 9 }),
    ]);

    expect(bars.map((bar) => bar.label)).toEqual(["Servis C", "Servis A", "Servis B"]);
    expect(bars.map((bar) => bar.value)).toEqual([9, 2, 2]);
  });

  it("prikazuje naziv umjesto ID-a, a ključ samo kad naziva nema (val 1, M15/B2)", () => {
    const bars = bottleneckBreakdownBars([
      row("ou-1", { label: "IT Ops", overdue: 1 }),
      row("ou-2", { label: "", overdue: 1 }),
      row("", { label: "", overdue: 1 }),
    ]);

    // Isti zbir (1) sortira se po labeli, pa prazna labela ide prva.
    expect(bars.map((bar) => bar.label)).toEqual(["", "IT Ops", "ou-2"]);
  });

  it("prioritet prevodi preko i18n ključa, ostalo ostavlja kako je došlo", () => {
    const translated = bottleneckBreakdownBars(
      [row("HIGH", { label: "HIGH", overdue: 3 })],
      (key) => `[${key}]`,
    );
    expect(translated[0].label).toBe("[tickets.priority.HIGH]");

    const unknown = bottleneckBreakdownBars([row("ou-1", { label: "IT Ops" })]);
    expect(unknown[0].label).toBe("IT Ops");
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
