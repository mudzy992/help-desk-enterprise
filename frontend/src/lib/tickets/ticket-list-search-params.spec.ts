import { describe, expect, it } from "vitest";
import {
  toTicketCountsSearchParams,
  toTicketListSearchParams,
} from "@/lib/tickets/ticket-list-search-params";

describe("toTicketListSearchParams", () => {
  it("always asks for a page so the API answers with the paged envelope", () => {
    expect(toTicketListSearchParams({}).toString()).toBe("page=1");
    expect(toTicketListSearchParams({ page: 3, pageSize: 25 }).toString()).toBe(
      "page=3&pageSize=25",
    );
  });

  it("sends several statuses as repeated keys", () => {
    const search = toTicketListSearchParams({ status: ["PENDING", "ASSIGNED"] });
    expect(search.getAll("status")).toEqual(["PENDING", "ASSIGNED"]);
    expect(toTicketListSearchParams({ status: "CLOSED" }).getAll("status")).toEqual([
      "CLOSED",
    ]);
  });

  it("leaves out empty values and false flags", () => {
    const search = toTicketListSearchParams({
      serviceId: "",
      priority: undefined,
      unassigned: false,
      overdue: true,
      q: "   ",
    });
    expect(search.toString()).toBe("overdue=true&page=1");
  });

  it("carries filters, sorting and a trimmed search term", () => {
    const search = toTicketListSearchParams({
      groupId: "g-it",
      atRisk: true,
      q: " vpn ",
      sort: "slaDueAt",
      dir: "asc",
      createdFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(Object.fromEntries(search)).toEqual({
      groupId: "g-it",
      atRisk: "true",
      q: "vpn",
      sort: "slaDueAt",
      dir: "asc",
      createdFrom: "2026-01-01T00:00:00.000Z",
      page: "1",
    });
  });
});

describe("toTicketCountsSearchParams", () => {
  it("sends only the narrowing filters, never a page", () => {
    expect(toTicketCountsSearchParams({}).toString()).toBe("");
    const search = toTicketCountsSearchParams({
      priority: "LOW",
      groupId: "g-it",
      unassigned: true,
      q: " vpn ",
    });
    expect(Object.fromEntries(search)).toEqual({
      priority: "LOW",
      groupId: "g-it",
      unassigned: "true",
      q: "vpn",
    });
  });

  it("leaves out empty values and false flags", () => {
    expect(
      toTicketCountsSearchParams({ serviceId: "", unassigned: false, q: "  " }).toString(),
    ).toBe("");
  });
});
