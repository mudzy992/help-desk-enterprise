import { describe, expect, it } from "vitest";
import { staffDeepLinkFilters } from "@/lib/tickets/staff-deep-link-filters";

describe("staffDeepLinkFilters", () => {
  it("reads every staff deep-link filter from the URL", () => {
    const url = new URLSearchParams(
      "view=all&forwarded=any&personal=mentionedMe&hideMerged=false&unroutedOverdue=true",
    );
    expect(staffDeepLinkFilters(url, true)).toEqual({
      forwarded: "any",
      personal: "mentionedMe",
      hideMerged: false,
      unroutedOverdue: true,
      inboxTab: undefined,
      status: "",
      statusesFromDeepLink: [],
      priority: "",
      overdue: false,
      atRisk: false,
    });
  });

  it("resolves to empty values while staff status is unknown or denied", () => {
    const url = new URLSearchParams(
      "status=UNROUTED&priority=CRITICAL&overdue=true&atRisk=true&inboxTab=unrouted",
    );
    expect(staffDeepLinkFilters(url, false)).toEqual({
      forwarded: "",
      personal: "",
      hideMerged: false,
      unroutedOverdue: false,
      inboxTab: undefined,
      status: "",
      statusesFromDeepLink: [],
      priority: "",
      overdue: false,
      atRisk: false,
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

  // Val 6.1 / modul 4 (D1): card links from the dashboard carry status,
  // priority, overdue and atRisk — the list must apply them.
  it("parses a single status from metric card links", () => {
    const url = new URLSearchParams("view=all&status=UNROUTED");
    const result = staffDeepLinkFilters(url, true);
    expect(result.status).toBe("UNROUTED");
    expect(result.statusesFromDeepLink).toEqual([]);
  });

  it("puts repeated status params into statusesFromDeepLink (server-side filter)", () => {
    const url = new URLSearchParams(
      "view=all&status=PENDING&status=UNROUTED&status=PENDING_APPROVAL",
    );
    const result = staffDeepLinkFilters(url, true);
    expect(result.status).toBe("PENDING");
    expect(result.statusesFromDeepLink).toEqual(["UNROUTED", "PENDING_APPROVAL"]);
  });

  it("parses priority, overdue and atRisk flags", () => {
    const url = new URLSearchParams("view=all&priority=CRITICAL&overdue=true&atRisk=true");
    const result = staffDeepLinkFilters(url, true);
    expect(result.priority).toBe("CRITICAL");
    expect(result.overdue).toBe(true);
    expect(result.atRisk).toBe(true);
  });

  it("ignores unknown status and priority values", () => {
    const url = new URLSearchParams("status=FAKE&priority=URGENT");
    const result = staffDeepLinkFilters(url, true);
    expect(result.status).toBe("");
    expect(result.statusesFromDeepLink).toEqual([]);
    expect(result.priority).toBe("");
  });
});
