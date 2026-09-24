import { describe, expect, it } from "vitest";
import {
  emptyHeaderSearchGroups,
  flattenHeaderSearchHits,
  headerSearchGroupLimit,
  toHeaderSearchGroups,
  type HeaderSearchGroups,
} from "@/components/layout/header-search-match";

const response = {
  tickets: [
    { id: "ticket-1", ticketNumber: "T-000042", title: "VPN pristup" },
    { id: "ticket-2", ticketNumber: "T-000043", title: "VPN pristup 2" },
  ],
  articles: [
    { id: "article-1", slug: "reset-lozinke", title: "Reset lozinke" },
  ],
  users: [{ id: "user-1", displayName: "Ana Hodžić", email: "ana@example.com" }],
};

describe("header search projection", () => {
  it("maps the three server groups onto palette rows", () => {
    const groups = toHeaderSearchGroups("vpn", response);
    expect(groups.tickets.map((hit) => hit.href)).toEqual([
      "/tickets/ticket-1",
      "/tickets/ticket-2",
    ]);
    // The ticket row shows the number as the title and the subject as subtitle.
    expect(groups.tickets[0]).toMatchObject({
      kind: "ticket",
      title: "T-000042",
      subtitle: "VPN pristup",
    });
    expect(groups.articles[0]).toMatchObject({
      kind: "article",
      href: "/knowledge-base?q=vpn",
    });
    expect(groups.users[0]).toMatchObject({
      kind: "user",
      subtitle: "ana@example.com",
      href: `/users?q=${encodeURIComponent("Ana Hodžić")}`,
    });
  });

  it("keeps the same hrefs the client built before phase 1.2", () => {
    const groups = toHeaderSearchGroups("  vpn  ", response);
    expect(groups.articles[0]?.href).toBe("/knowledge-base?q=vpn");
  });

  it("caps each group at five and flattens in ticket/article/user order", () => {
    const many = {
      tickets: Array.from({ length: 9 }, (_, index) => ({
        id: `ticket-${index}`,
        ticketNumber: `T-${index}`,
        title: "VPN",
      })),
      articles: response.articles,
      users: response.users,
    };
    const groups = toHeaderSearchGroups("vpn", many);
    expect(groups.tickets).toHaveLength(headerSearchGroupLimit);
    const flat = flattenHeaderSearchHits(groups);
    expect(flat[0]?.kind).toBe("ticket");
    expect(flat.at(-2)?.kind).toBe("article");
    expect(flat.at(-1)?.kind).toBe("user");
  });

  it("answers with empty groups for any response shape without hits", () => {
    expect(
      toHeaderSearchGroups("vpn", { tickets: [], articles: [], users: [] }),
    ).toEqual(emptyHeaderSearchGroups);
    const groups: HeaderSearchGroups = toHeaderSearchGroups("vpn", {
      tickets: [],
      articles: response.articles,
      users: [],
    });
    expect(groups.articles).toHaveLength(1);
  });
});
