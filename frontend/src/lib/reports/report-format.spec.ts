import { describe, expect, it } from "vitest";
import {
  deltaTone,
  formatCsat,
  formatHours,
  formatMinutes,
  formatSignedPercent,
} from "@/lib/reports/report-format";

describe("report formatters", () => {
  it("formats locale-aware KPI units without inventing values", () => {
    expect(formatMinutes(26.4, "bs")).toBe("26 min");
    expect(formatHours(6.4, "bs")).toBe("6,4 h");
    expect(formatCsat(4.6, 5, "bs")).toBe("4,6 / 5");
    expect(formatSignedPercent(-6)).toBe("-6%");
    expect(formatSignedPercent(3)).toBe("+3%");
  });

  it("treats lower created/time deltas as success", () => {
    expect(deltaTone(-6, true)).toBe("success");
    expect(deltaTone(8, true)).toBe("warning");
    expect(deltaTone(0, true)).toBe("neutral");
  });
});
