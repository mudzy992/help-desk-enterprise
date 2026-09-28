import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import {
  allowedTrendGranularities,
  daysBetweenInclusive,
  estimateTrendGranularity,
  formatTrendBucketLong,
  formatTrendBucketShort,
  formatTrendHours,
  parseTrendsSearch,
  readReportErrorCode,
  resolveTrendPresetRange,
  toTrendsQuery,
  toTrendsSearch,
} from "./report-trends-view";

const now = new Date(2026, 8, 27, 10, 0); // 27.09.2026. local

describe("trend presets", () => {
  it("day presets end today and include it", () => {
    expect(resolveTrendPresetRange("30d", now)).toEqual({ from: "2026-08-29", to: "2026-09-27" });
    expect(daysBetweenInclusive("2026-08-29", "2026-09-27")).toBe(30);
  });

  it("month presets start on the 1st so only the current bucket is partial", () => {
    expect(resolveTrendPresetRange("12m", now)).toEqual({ from: "2025-10-01", to: "2026-09-27" });
    expect(resolveTrendPresetRange("36m", now)).toEqual({ from: "2023-10-01", to: "2026-09-27" });
    expect(resolveTrendPresetRange("custom", now)).toBeNull();
  });
});

describe("granularity (mirrors the backend rules)", () => {
  it("estimates the automatic granularity", () => {
    expect(estimateTrendGranularity("2026-09-01", "2026-10-01")).toBe("day");
    expect(estimateTrendGranularity("2026-09-01", "2026-10-02")).toBe("week");
    expect(estimateTrendGranularity("2026-01-01", "2026-07-02")).toBe("week");
    expect(estimateTrendGranularity("2026-01-01", "2026-07-03")).toBe("month");
  });

  it("offers only granularities within the bucket limits", () => {
    expect(allowedTrendGranularities("2026-07-01", "2026-09-30")).toEqual(["day", "week", "month"]);
    expect(allowedTrendGranularities("2026-07-01", "2026-10-01")).toEqual(["week", "month"]);
    expect(allowedTrendGranularities("2023-10-01", "2026-09-27")).toEqual(["month"]);
  });
});

describe("URL state", () => {
  it("defaults to 12 months with automatic granularity", () => {
    const state = parseTrendsSearch(new URLSearchParams("tab=trends"), now);
    expect(state).toMatchObject({ preset: "12m", from: "2025-10-01", to: "2026-09-27", granularity: null });
  });

  it("reads the link from the scheduled e-mail as a custom range", () => {
    const state = parseTrendsSearch(
      new URLSearchParams("tab=trends&organizationalUnitId=ou-it&from=2025-03-01&to=2026-02-28&granularity=month&groupId=grp"),
      now,
    );
    expect(state).toMatchObject({
      preset: "custom",
      from: "2025-03-01",
      to: "2026-02-28",
      granularity: "month",
      organizationalUnitId: "ou-it",
      groupId: "grp",
      serviceId: null,
    });
  });

  it("ignores invalid values", () => {
    const state = parseTrendsSearch(
      new URLSearchParams("from=2026-09-10&to=2026-09-01&granularity=year&priority=URGENT&preset=7y"),
      now,
    );
    expect(state).toMatchObject({ preset: "12m", granularity: null, priority: null });
  });

  it("round-trips through the URL and re-resolves named presets", () => {
    const state = parseTrendsSearch(new URLSearchParams("preset=90d&priority=HIGH&serviceId=svc"), now);
    const search = toTrendsSearch(state);
    expect(search.toString()).toBe("tab=trends&preset=90d&serviceId=svc&priority=HIGH");
    expect(parseTrendsSearch(search, now)).toEqual(state);
  });

  it("builds the API query without empty filters", () => {
    const state = parseTrendsSearch(new URLSearchParams("preset=6m"), now);
    expect(toTrendsQuery(state, "ou-it")).toEqual({ organizationalUnitId: "ou-it", from: "2026-04-01", to: "2026-09-27" });
  });
});

describe("formatting", () => {
  it("labels buckets", () => {
    expect(formatTrendBucketShort("2026-03-23", "week", "bs")).toBe("23.03.");
    expect(formatTrendBucketLong("2026-03-23", "week", "bs")).toBe("23.03. – 29.03.2026.");
    expect(formatTrendBucketLong("2025-12-29", "week", "bs")).toBe("29.12.2025. – 04.01.2026.");
    expect(formatTrendBucketLong("2026-09-27", "day", "bs")).toBe("27.09.2026.");
    expect(formatTrendBucketShort("2026-09-01", "month", "en")).toMatch(/^Sep 26$/);
  });

  it("formats durations", () => {
    expect(formatTrendHours(null, "bs")).toBe("—");
    expect(formatTrendHours(0.5, "bs")).toBe("30 min");
    expect(formatTrendHours(3.25, "en")).toBe("3.3 h");
    expect(formatTrendHours(72, "bs")).toBe("3 d");
  });
});

describe("error codes", () => {
  it("recognises report domain codes only", () => {
    expect(readReportErrorCode(new ApiError(400, "REPORT_WINDOW_INVALID", "x", null))).toBe("REPORT_WINDOW_INVALID");
    expect(readReportErrorCode(new ApiError(403, "FORBIDDEN", "x", null))).toBeNull();
    expect(readReportErrorCode(new Error("x"))).toBeNull();
  });
});
