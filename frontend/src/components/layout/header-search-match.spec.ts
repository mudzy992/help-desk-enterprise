import { describe, expect, it } from "vitest";
import {
  buildHeaderSearchGroups,
  headerSearchGroupLimit,
  matchDirectoryUser,
  matchKnowledgeArticle,
  matchTicketTitleOrNumber,
} from "@/components/layout/header-search-match";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";
import type { TicketResponse } from "@/services/tickets-api";

const ticket = {
  id: "ticket-1",
  ticketNumber: "T-000042",
  title: "VPN access",
  description: "secret-description-token",
} as TicketResponse;

const article = {
  id: "article-1",
  title: "Reset lozinke",
  body: "Koristite self-service portal.",
} as KnowledgeArticleResponse;

const user = {
  id: "user-1",
  displayName: "Ana Hodžić",
  email: "ana@example.com",
  organizationalUnitPath: "OU=IT,OU=EP",
} as DirectoryUser;

describe("header search matching", () => {
  it("matches tickets by number or title, not description", () => {
    expect(matchTicketTitleOrNumber(ticket, "000042")).toBe(true);
    expect(matchTicketTitleOrNumber(ticket, "vpn")).toBe(true);
    expect(matchTicketTitleOrNumber(ticket, "secret-description-token")).toBe(false);
    expect(matchTicketTitleOrNumber(ticket, "   ")).toBe(false);
  });

  it("matches knowledge articles by title or body", () => {
    expect(matchKnowledgeArticle(article, "lozinke")).toBe(true);
    expect(matchKnowledgeArticle(article, "self-service")).toBe(true);
    expect(matchKnowledgeArticle(article, "")).toBe(false);
  });

  it("matches directory users by name, email, or OU path", () => {
    expect(matchDirectoryUser(user, "hodžić")).toBe(true);
    expect(matchDirectoryUser(user, "ana@")).toBe(true);
    expect(matchDirectoryUser(user, "OU=IT")).toBe(true);
    expect(matchDirectoryUser(user, "finance")).toBe(false);
  });

  it("builds grouped hrefs and caps each group at five", () => {
    const tickets = Array.from({ length: 7 }, (_, index) => ({
      ...ticket,
      id: `ticket-${index}`,
      ticketNumber: `T-${index}`,
      title: "VPN access",
    })) as TicketResponse[];
    const groups = buildHeaderSearchGroups("vpn", tickets, [article], [user]);
    expect(groups.tickets).toHaveLength(headerSearchGroupLimit);
    expect(groups.tickets[0]?.href).toBe("/tickets/ticket-0");
    expect(groups.articles).toHaveLength(0);
    expect(groups.users).toHaveLength(0);
    expect(buildHeaderSearchGroups("lozinke", [], [article], []).articles[0]?.href).toBe(
      "/knowledge-base?q=lozinke",
    );
    const userGroups = buildHeaderSearchGroups("ana", [], [], [user]);
    expect(userGroups.users[0]?.href).toBe(`/users?q=${encodeURIComponent("Ana Hodžić")}`);
    expect(buildHeaderSearchGroups("", [ticket], [article], [user])).toEqual({
      tickets: [],
      articles: [],
      users: [],
    });
  });
});
