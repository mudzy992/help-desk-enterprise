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
      // Without an explicit inboxTab param the helper leaves the default to
      // the hook (so all/teams do not carry a misleading "unrouted" value).
      inboxTab: undefined,
    });
  });

  it("resolves to empty values while staff status is unknown or denied", () => {
    expect(staffDeepLinkFilters(url, false)).toEqual({
      forwarded: "",
      personal: "",
      hideMerged: false,
      unroutedOverdue: false,
      inboxTab: undefined,
    });
  });

  it("hides merged children for staff unless the URL opts out", () => {
    expect(staffDeepLinkFilters(new URLSearchParams(), true).hideMerged).toBe(true);
  });

  it("honors an explicit inboxTab URL param for staff", () => {
    const withTab = new URLSearchParams("inboxTab=group-42");
    expect(staffDeepLinkFilters(withTab, true).inboxTab).toBe("group-42");
  });

  it("ignores unknown filter values", () => {
    expect(staffDeepLinkFilters(new URLSearchParams("forwarded=bogus"), true).forwarded).toBe("");
  });
});
