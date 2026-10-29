import { describe, expect, it } from "vitest";
import { parseSlaPageSearch, updateSlaPageSearch } from "@/lib/sla/sla-page-search";

describe("SLA page URL state", () => {
  it("parses view, subtab, OU and active profile deep links", () => {
    expect(
      parseSlaPageSearch(
        new URLSearchParams(
          "view=profiles&panel=compliance&organizationalUnitId=ou-1&profileId=p-2",
        ),
      ),
    ).toEqual({
      view: "profiles",
      panel: "compliance",
      organizationalUnitId: "ou-1",
      profileId: "p-2",
    });
  });

  it("normalizes invalid navigation and preserves scope through view changes", () => {
    const input = new URLSearchParams("view=invalid&organizationalUnitId=ou-1&profileId=p-2");
    expect(parseSlaPageSearch(input).view).toBe("profiles");
    const next = updateSlaPageSearch(input, { view: "matrix" });
    expect(next.get("organizationalUnitId")).toBe("ou-1");
    expect(next.get("profileId")).toBe("p-2");
  });

  it("removes default values on reset", () => {
    const reset = updateSlaPageSearch(new URLSearchParams("view=matrix&panel=compliance"), {
      view: "profiles",
      panel: "profiles",
    });
    expect(reset.toString()).toBe("");
  });
});
