import { describe, expect, it } from "vitest";
import {
  catalogQueryStaleTimeMs,
  createHelpdeskQueryClient,
  defaultQueryStaleTimeMs,
  queryRetryCount,
} from "@/lib/query/query-client";
import { localDayKey, queryKeys } from "@/lib/query/query-keys";

describe("createHelpdeskQueryClient", () => {
  it("uses the documented defaults", () => {
    const client = createHelpdeskQueryClient();
    const defaults = client.getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(defaultQueryStaleTimeMs);
    expect(defaults?.staleTime).toBe(30_000);
    expect(defaults?.retry).toBe(queryRetryCount);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
  });

  it("keeps catalogs fresh for five minutes", () => {
    expect(catalogQueryStaleTimeMs).toBe(300_000);
    expect(catalogQueryStaleTimeMs).toBeGreaterThan(defaultQueryStaleTimeMs);
  });
});

describe("localDayKey", () => {
  it("keys the browser's local day, not the UTC day", () => {
    // Constructed in local time (`monthIndex` 8 = September), so the answer is
    // the same whatever zone the test process runs in.
    expect(localDayKey(new Date(2026, 8, 24, 22, 30))).toBe("2026-09-24");
    expect(localDayKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
    expect(localDayKey(new Date(2026, 11, 31, 23, 59, 59, 999))).toBe("2026-12-31");
  });
});

describe("queryKeys", () => {
  it("builds stable keys for the same resource", () => {
    expect(queryKeys.routingCatalog).toEqual(["catalog", "routing"]);
    expect(queryKeys.ticket("ticket-1")).toEqual([
      "tickets",
      "detail",
      "ticket-1",
    ]);
    expect(queryKeys.dashboardSummary("all", "2026-09-24")).toEqual([
      "dashboard",
      "summary",
      "all",
      "2026-09-24",
    ]);
    // A new day is a new entry, never a stale hit.
    expect(queryKeys.dashboardSummary("all", "2026-09-25")).not.toEqual(
      queryKeys.dashboardSummary("all", "2026-09-24"),
    );
    expect(queryKeys.dashboardSummaryPrefix("all")).toEqual([
      "dashboard",
      "summary",
      "all",
    ]);
    expect(queryKeys.ticket("ticket-1")).toEqual(queryKeys.ticket("ticket-1"));
  });
});
