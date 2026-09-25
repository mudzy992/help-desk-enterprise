import { describe, expect, it } from "vitest";
import { formatReportCell, nextReportSort, sortReportRows } from "@/lib/reports/report-pack-table";
import { buildReportPackQuery } from "@/services/report-packs-api";

describe("report pack table helpers", () => {
  const rows = [
    { name: "Štampač", count: 2 },
    { name: "Aplikacije", count: null },
    { name: "Zaštita", count: 10 },
  ];

  it("sorts numbers numerically with nulls last, text by locale", () => {
    const byCount = sortReportRows(rows, { column: "count", direction: "desc" }, "bs");
    expect(byCount.map((row) => row.count)).toEqual([10, 2, null]);
    const byName = sortReportRows(rows, { column: "name", direction: "asc" }, "bs");
    expect(byName.map((row) => row.name)).toEqual(["Aplikacije", "Štampač", "Zaštita"]);
  });

  it("toggles direction on the same column and starts descending on a new one", () => {
    expect(nextReportSort(null, "count")).toEqual({ column: "count", direction: "desc" });
    expect(nextReportSort({ column: "count", direction: "desc" }, "count").direction).toBe("asc");
  });

  it("formats nulls, confidential titles and ISO instants", () => {
    const labels = { confidential: "[povjerljivo]" };
    expect(formatReportCell(null, "bs", labels)).toBe("—");
    expect(formatReportCell("[confidential]", "bs", labels)).toBe("[povjerljivo]");
    expect(formatReportCell("VPN", "bs", labels)).toBe("VPN");
    expect(formatReportCell("2026-09-01T08:00:00.000Z", "en-GB", labels)).toMatch(/2026|26/);
  });

  it("builds the scope query, with the format only for downloads", () => {
    const scope = { organizationalUnitId: "ou 1", from: "2026-09-01T00:00:00.000Z", to: "2026-09-02T00:00:00.000Z" };
    expect(buildReportPackQuery(scope)).not.toContain("format");
    expect(buildReportPackQuery(scope, "csv")).toContain("format=csv");
    expect(buildReportPackQuery(scope)).toContain("organizationalUnitId=ou+1");
  });
});
