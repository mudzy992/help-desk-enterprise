import type {
  KnowledgeArticleResponse,
  KnowledgeArticleStatus,
} from "@/services/knowledge-base-api";

export const knowledgeArticleStatusValues = [
  "DRAFT",
  "IN_REVIEW",
  "PUBLISHED",
  "ARCHIVED",
] as const satisfies readonly KnowledgeArticleStatus[];

export type KnowledgeListFilters = {
  readonly search: string;
  readonly status: KnowledgeArticleStatus | "";
  readonly serviceId: string;
  readonly staleOnly: boolean;
};

export function knowledgeListFiltersAreActive(
  filters: KnowledgeListFilters,
): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== "" ||
    filters.serviceId !== "" ||
    filters.staleOnly
  );
}

export function filterKnowledgeArticles(
  items: readonly KnowledgeArticleResponse[],
  filters: KnowledgeListFilters,
): readonly KnowledgeArticleResponse[] {
  const needle = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.status !== "" && item.status !== filters.status) {
      return false;
    }
    if (filters.serviceId !== "" && item.serviceId !== filters.serviceId) {
      return false;
    }
    if (filters.staleOnly && !item.isStale) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    return (
      item.title.toLowerCase().includes(needle) ||
      item.body.toLowerCase().includes(needle) ||
      item.slug.toLowerCase().includes(needle)
    );
  });
}
