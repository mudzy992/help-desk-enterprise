import { describe, expect, it } from "vitest";
import {
  isTimestampInWindow,
  previousReportWindow,
  resolveReportWindow,
  toDateInputValue,
} from "@/lib/reports/report-window";

describe("resolveReportWindow", () => {
  const now = new Date(2026, 8, 15, 12, 0, 0);

  it("uses 15/30 local days inclusive of today", () => {
    const fifteen = resolveReportWindow({
      preset: "15d",
      customFrom: "",
      customTo: "",
      now,
    });
    const thirty = resolveReportWindow({
      preset: "30d",
      customFrom: "",
      customTo: "",
      now,
    });
    expect(toDateInputValue(fifteen!.from)).toBe("2026-09-01");
    expect(toDateInputValue(thirty!.from)).toBe("2026-08-17");
    expect(fifteen!.to).toEqual(now);
  });

  it("rolls 6 and 12 months back from the start of today", () => {
    const six = resolveReportWindow({
      preset: "6m",
      customFrom: "",
      customTo: "",
      now,
    });
    const twelve = resolveReportWindow({
      preset: "12m",
      customFrom: "",
      customTo: "",
      now,
    });
    expect(toDateInputValue(six!.from)).toBe("2026-03-15");
    expect(toDateInputValue(twelve!.from)).toBe("2025-09-15");
  });

  it("parses only a complete, ordered custom range", () => {
    const valid = resolveReportWindow({
      preset: "custom",
      customFrom: "2026-09-10",
      customTo: "2026-09-20",
      now,
    });
    expect(toDateInputValue(valid!.from)).toBe("2026-09-10");
    expect(toDateInputValue(valid!.to)).toBe("2026-09-20");
    expect(
      resolveReportWindow({
        preset: "custom",
        customFrom: "2026-09-20",
        customTo: "2026-09-10",
        now,
      }),
    ).toBeNull();
  });

  it("rejects missing and impossible custom dates instead of silently falling back", () => {
    expect(resolveReportWindow({ preset: "custom", customFrom: "", customTo: "", now })).toBeNull();
    expect(
      resolveReportWindow({
        preset: "custom",
        customFrom: "2026-02-31",
        customTo: "2026-03-10",
        now,
      }),
    ).toBeNull();
  });
});

describe("previousReportWindow", () => {
  it("returns an equal-length window ending before the current from", () => {
    const current = {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 15, 12),
    };
    const previous = previousReportWindow(current);
    const duration = current.to.getTime() - current.from.getTime();
    expect(previous.to.getTime()).toBe(current.from.getTime() - 1);
    expect(previous.from.getTime()).toBe(current.from.getTime() - duration);
  });
});

describe("isTimestampInWindow", () => {
  const window = {
    from: new Date(2026, 8, 1),
    to: new Date(2026, 8, 15, 23, 59, 59, 999),
  };

  it("accepts timestamps on the inclusive bounds", () => {
    expect(isTimestampInWindow(new Date(2026, 8, 1).toISOString(), window)).toBe(true);
    expect(isTimestampInWindow(new Date(2026, 8, 15, 23, 59, 59, 999).toISOString(), window)).toBe(
      true,
    );
    expect(isTimestampInWindow(new Date(2026, 7, 31).toISOString(), window)).toBe(false);
  });
});
