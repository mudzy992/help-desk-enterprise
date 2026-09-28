import { describe, expect, it } from "vitest";
import { staffDeepLinkFilters } from "@/lib/tickets/staff-deep-link-filters";

describe("staffDeepLinkFilters", () => {
  const url = new URLSearchParams(
    "view=all&forwarded=any&personal=mentionedMe&hideMerged=false&unroutedOverdue=true",
  );

  it("reads every staff deep-link filter from the URL", () => {
    expect(staffDeepLinkFilters(url, true)).toEqual({
      forwarded: "any",
      personal: "mentionedMe",
      hideMerged: false,
      unroutedOverdue: true,
    });
  });

  it("resolves to empty values while staff status is unknown or denied", () => {
    expect(staffDeepLinkFilters(url, false)).toEqual({
      forwarded: "",
      personal: "",
      hideMerged: false,
      unroutedOverdue: false,
    });
  });

  it("hides merged children for staff unless the URL opts out", () => {
    expect(staffDeepLinkFilters(new URLSearchParams(), true).hideMerged).toBe(true);
  });

  it("ignores unknown filter values", () => {
    expect(staffDeepLinkFilters(new URLSearchParams("forwarded=bogus"), true).forwarded).toBe("");
  });
});
