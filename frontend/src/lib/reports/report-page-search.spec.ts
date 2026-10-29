import { describe, expect, it } from "vitest";
import { parseReportPageSearch, updateReportPageSearch } from "@/lib/reports/report-page-search";

describe("report page URL state", () => {
  it("parses a shareable deep link and preserves its scope across tabs", () => {
    const input = new URLSearchParams(
      "tab=packs&organizationalUnitId=ou-2&window=custom&windowFrom=2026-09-01&windowTo=2026-09-30&serviceId=s-1",
    );
    expect(parseReportPageSearch(input, true)).toMatchObject({
      tab: "packs",
      organizationalUnitId: "ou-2",
      preset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
    });
    const changed = updateReportPageSearch(input, { tab: "bottlenecks" });
    expect(changed.get("organizationalUnitId")).toBe("ou-2");
    expect(changed.get("windowFrom")).toBe("2026-09-01");
    expect(changed.get("serviceId")).toBe("s-1");
  });

  it("normalizes invalid values and removes custom dates when resetting preset", () => {
    const input = new URLSearchParams("tab=nope&window=nope&windowFrom=bad&windowTo=bad");
    expect(parseReportPageSearch(input, false)).toMatchObject({ tab: "overview", preset: "30d" });
    const reset = updateReportPageSearch(input, { preset: "30d", tab: "overview" });
    expect(reset.has("window")).toBe(false);
    expect(reset.has("windowFrom")).toBe(false);
    expect(reset.has("windowTo")).toBe(false);
  });

  it("rejects a schedules deep link without permission", () => {
    expect(parseReportPageSearch(new URLSearchParams("tab=schedules"), false).tab).toBe("overview");
  });
});
