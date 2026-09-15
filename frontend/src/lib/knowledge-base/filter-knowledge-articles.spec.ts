import { describe, expect, it } from "vitest";
import {
  filterKnowledgeArticles,
  knowledgeListFiltersAreActive,
  type KnowledgeListFilters,
} from "@/lib/knowledge-base/filter-knowledge-articles";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";

function article(
  overrides: Partial<KnowledgeArticleResponse> & Pick<KnowledgeArticleResponse, "id">,
): KnowledgeArticleResponse {
  return {
    slug: "kb-vpn",
    title: "VPN konekcija",
    body: "Greška 809 na Windows klijentu.",
    status: "PUBLISHED",
    classification: "INTERNAL",
    isStale: false,
    reviewDueAt: null,
    publishedAt: null,
    lastReviewedAt: null,
    ownerUserId: "user-1",
    ownerGroupId: null,
    reviewerUserId: null,
    serviceId: "svc-vpn",
    organizationalUnitId: "ou-it",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function filters(overrides: Partial<KnowledgeListFilters> = {}): KnowledgeListFilters {
  return {
    search: "",
    status: "",
    serviceId: "",
    staleOnly: false,
    ...overrides,
  };
}

describe("filterKnowledgeArticles", () => {
  const rows = [
    article({ id: "a", title: "VPN 809", slug: "kb-809" }),
    article({
      id: "b",
      title: "Refundacija",
      body: "Zahtjev za povrat.",
      status: "DRAFT",
      serviceId: "svc-hr",
      slug: "kb-refund",
    }),
    article({
      id: "c",
      title: "VPN certifikat",
      status: "IN_REVIEW",
      isStale: true,
    }),
  ];

  it("filters by search, status, service, and stale", () => {
    expect(filterKnowledgeArticles(rows, filters({ search: "vpn" })).map((item) => item.id)).toEqual(
      ["a", "c"],
    );
    expect(
      filterKnowledgeArticles(rows, filters({ status: "DRAFT", serviceId: "svc-hr" })).map(
        (item) => item.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterKnowledgeArticles(rows, filters({ staleOnly: true })).map((item) => item.id),
    ).toEqual(["c"]);
  });

  it("treats empty filters as inactive and search-only as active", () => {
    expect(knowledgeListFiltersAreActive(filters())).toBe(false);
    expect(knowledgeListFiltersAreActive(filters({ search: "vpn" }))).toBe(true);
    expect(knowledgeListFiltersAreActive(filters({ staleOnly: true }))).toBe(true);
  });
});
