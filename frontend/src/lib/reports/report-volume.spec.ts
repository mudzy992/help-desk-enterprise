import { describe, expect, it } from "vitest";
import { reportTestTicket as ticket } from "@/lib/reports/report-test-ticket";
import { buildReportVolumeSeries } from "@/lib/reports/report-volume";

describe("buildReportVolumeSeries", () => {
  it("buckets created and resolved tickets per local day in a short window", () => {
    const series = buildReportVolumeSeries(
      [
        ticket("1", "PENDING", {
          createdAt: new Date(2026, 8, 14, 8).toISOString(),
        }),
        ticket("2", "RESOLVED", {
          createdAt: new Date(2026, 8, 10, 9).toISOString(),
          resolvedAt: new Date(2026, 8, 13, 10).toISOString(),
        }),
      ],
      {
        from: new Date(2026, 8, 10),
        to: new Date(2026, 8, 14, 18),
      },
    );
    expect(series).toHaveLength(5);
    expect(series[0]).toEqual({ d: "10. 09", created: 1, resolved: 0 });
    expect(series[3]).toEqual({ d: "13. 09", created: 0, resolved: 1 });
    expect(series[4]).toEqual({ d: "14. 09", created: 1, resolved: 0 });
  });
});
