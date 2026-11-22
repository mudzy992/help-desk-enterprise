import { apiRequest } from "@/services/api";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";

/** Paket 2.9 (K1): knowledge portal API (`/knowledge-base/portal`). */
export type KnowledgeCategory = {
  readonly id: string;
  readonly key: string;
  readonly nameBs: string;
  readonly nameEn: string;
  readonly icon: string;
  readonly sortOrder: number;
  readonly parentId: string | null;
  readonly isArchived: boolean;
};

export type KnowledgePortalCategory = KnowledgeCategory & { readonly articleCount: number };

export type KnowledgePortalArticle = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly categoryId: string | null;
  readonly isFaq: boolean;
  readonly faqOrder: number | null;
  readonly averageRating: number | null;
  readonly ratingCount: number;
  readonly viewCount: number;
  readonly isStale: boolean;
  readonly publishedAt: string | null;
};

export type KnowledgePortalHome = {
  readonly categories: readonly KnowledgePortalCategory[];
  readonly faq: readonly (KnowledgePortalArticle & { readonly body: string })[];
  readonly uncategorizedCount: number;
  /** W7.52: false when the portal counts come from a capped scan. */
  readonly articleCountsComplete: boolean;
  /** W7.90: false when the taxonomy has more roots than one page carries. */
  readonly categoriesComplete: boolean;
  readonly capabilities: {
    readonly canManageCategories: boolean;
    readonly canCurate: boolean;
    readonly canDraftFromReply: boolean;
  };
  readonly feedbackEnabled: boolean;
};

export type SaveKnowledgeCategoryInput = {
  readonly key?: string;
  readonly nameBs?: string;
  readonly nameEn?: string;
  readonly icon?: string;
  readonly sortOrder?: number;
  readonly parentId?: string | null;
};

export type KnowledgeComment = {
  readonly id: string;
  readonly articleId: string;
  readonly articleTitle: string;
  readonly rating: number;
  readonly comment: string;
  readonly createdAt: string;
};

export type KnowledgeCommentPage = {
  readonly items: readonly KnowledgeComment[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type KnowledgeInsights = {
  readonly mostViewed: readonly (KnowledgePortalArticle & { readonly views30d: number })[];
  readonly lowestRated: readonly KnowledgePortalArticle[];
  readonly notViewed: readonly KnowledgePortalArticle[];
  /** W7.90: a page, so the panel can say it was cut off and ask for the rest. */
  readonly openComments: KnowledgeCommentPage;
  readonly thresholds: { readonly minRatings: number; readonly notViewedDays: number };
};

export type KnowledgeReplyReplacements = {
  readonly email: number;
  readonly person: number;
  readonly ip: number;
  readonly phone: number;
};

export type KnowledgeDraftFromReply = {
  readonly title: string;
  readonly body: string;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly sourceTicketId: string;
  readonly sourceMessageId: string;
  readonly ticketNumber: string;
  readonly replacements: KnowledgeReplyReplacements;
};

const base = "/knowledge-base/portal";

export function getKnowledgePortalHome(): Promise<KnowledgePortalHome> {
  return apiRequest(base);
}

export type KnowledgePortalArticlePage = {
  readonly items: readonly KnowledgePortalArticle[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export function listKnowledgeCategoryArticles(
  categoryId: string,
  params: { readonly limit?: number; readonly cursor?: string } = {},
): Promise<KnowledgePortalArticlePage> {
  const search = new URLSearchParams();
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params.cursor !== undefined && params.cursor.length > 0) {
    search.set("cursor", params.cursor);
  }
  const suffix = search.size === 0 ? "" : `?${search.toString()}`;
  return apiRequest(`${base}/categories/${encodeURIComponent(categoryId)}/articles${suffix}`);
}

export type KnowledgeCategoryPage = {
  readonly items: readonly KnowledgeCategory[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

/**
 * W7.90 (`BA-knowledge-base-17`): the taxonomy endpoint pages by root — a returned root always carries its
 * children — so the caller knows when the list is not the whole tree instead of assuming it is.
 */
export function listKnowledgeCategories(
  includeArchived = false,
  params: { readonly limit?: number; readonly cursor?: string } = {},
): Promise<KnowledgeCategoryPage> {
  const search = new URLSearchParams();
  if (includeArchived) {
    search.set("includeArchived", "true");
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params.cursor !== undefined && params.cursor.length > 0) {
    search.set("cursor", params.cursor);
  }
  const suffix = search.size === 0 ? "" : `?${search.toString()}`;
  return apiRequest(`${base}/categories${suffix}`);
}

/**
 * W7.90 (`BA-knowledge-base-17`): pickers (placement, category manager, draft-from-reply) need the whole
 * taxonomy, and the endpoint is a page now. Walk the root pages — each returned root already carries its
 * children — up to a documented cap, and report whether the cap stopped us. The cap is far above any real
 * taxonomy (10 pages × 100 roots), so `truncated` is a warning, not a normal state.
 */
const knowledgeCategoryWalkMaxPages = 10;
const knowledgeCategoryWalkPageSize = 100;

export async function listAllKnowledgeCategories(
  includeArchived = false,
): Promise<{ readonly items: readonly KnowledgeCategory[]; readonly truncated: boolean }> {
  const items: KnowledgeCategory[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < knowledgeCategoryWalkMaxPages; page += 1) {
    const result = await listKnowledgeCategories(includeArchived, {
      limit: knowledgeCategoryWalkPageSize,
      cursor,
    });
    items.push(...result.items);
    if (!result.hasMore || result.nextCursor === null) {
      return { items, truncated: false };
    }
    cursor = result.nextCursor;
  }
  return { items, truncated: true };
}

/** W7.90: the next page of the curator comment feed. */
export function listKnowledgeInsightComments(
  params: { readonly limit?: number; readonly cursor?: string } = {},
): Promise<KnowledgeCommentPage> {
  const search = new URLSearchParams();
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params.cursor !== undefined && params.cursor.length > 0) {
    search.set("cursor", params.cursor);
  }
  const suffix = search.size === 0 ? "" : `?${search.toString()}`;
  return apiRequest(`${base}/insights/comments${suffix}`);
}

export function createKnowledgeCategory(
  input: SaveKnowledgeCategoryInput,
): Promise<KnowledgeCategory> {
  return apiRequest(`${base}/categories`, { method: "POST", body: JSON.stringify(input) });
}

export function updateKnowledgeCategory(
  id: string,
  input: SaveKnowledgeCategoryInput,
): Promise<KnowledgeCategory> {
  return apiRequest(`${base}/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function setKnowledgeCategoryArchived(
  id: string,
  archived: boolean,
): Promise<KnowledgeCategory> {
  return apiRequest(`${base}/categories/${id}/${archived ? "archive" : "restore"}`, {
    method: "POST",
  });
}

export function placeKnowledgeArticle(
  articleId: string,
  input: {
    readonly categoryId?: string | null;
    readonly isFaq?: boolean;
    readonly faqOrder?: number | null;
    readonly reason: string;
  },
): Promise<KnowledgeArticleResponse> {
  return apiRequest(`${base}/articles/${articleId}/placement`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function recordKnowledgeArticleView(articleId: string): Promise<void> {
  return apiRequest(`${base}/articles/${articleId}/view`, { method: "POST" });
}

export function getKnowledgeInsights(): Promise<KnowledgeInsights> {
  return apiRequest(`${base}/insights`);
}

export function resolveKnowledgeComment(feedbackId: string): Promise<void> {
  return apiRequest(`${base}/feedback/${feedbackId}/resolve`, { method: "POST" });
}

export function previewKnowledgeDraftFromReply(input: {
  readonly ticketId: string;
  readonly messageId: string;
}): Promise<KnowledgeDraftFromReply> {
  return apiRequest(`${base}/from-reply/preview`, { method: "POST", body: JSON.stringify(input) });
}

export function createKnowledgeArticleFromReply(input: {
  readonly ticketId: string;
  readonly messageId: string;
  readonly title: string;
  readonly body: string;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly ownerUserId?: string;
  readonly categoryId?: string;
  readonly reason: string;
}): Promise<
  KnowledgeArticleResponse & {
    /** Val 2 (M14/B1): šta je server zamijenio u poslanom tekstu. */
    readonly replacements: KnowledgeReplyReplacements;
    readonly sanitized: boolean;
    /** W7.82 (`BA-knowledge-base-08`): `true` kad je nacrt za taj odgovor već postojao i vraćen je taj. */
    readonly alreadyCreated?: boolean;
  }
> {
  return apiRequest(`${base}/from-reply`, { method: "POST", body: JSON.stringify(input) });
}

/** Paket 2.9 (K1b): 1-5 rating; a comment only with rating <= 2. */
export function rateKnowledgeArticle(
  articleId: string,
  rating: number,
  comment?: string,
): Promise<{ readonly rating: number | null; readonly isHelpful: boolean }> {
  return apiRequest(`/knowledge-base/articles/${articleId}/feedback`, {
    method: "POST",
    body: JSON.stringify(
      comment !== undefined && comment.trim().length > 0
        ? { rating, comment: comment.trim() }
        : { rating },
    ),
  });
}
