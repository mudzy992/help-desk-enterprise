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

export type KnowledgeInsights = {
  readonly mostViewed: readonly (KnowledgePortalArticle & { readonly views30d: number })[];
  readonly lowestRated: readonly KnowledgePortalArticle[];
  readonly notViewed: readonly KnowledgePortalArticle[];
  readonly openComments: readonly {
    readonly id: string;
    readonly articleId: string;
    readonly articleTitle: string;
    readonly rating: number;
    readonly comment: string;
    readonly createdAt: string;
  }[];
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

export function listKnowledgeCategoryArticles(
  categoryId: string,
): Promise<readonly KnowledgePortalArticle[]> {
  return apiRequest(`${base}/categories/${encodeURIComponent(categoryId)}/articles`);
}

export function listKnowledgeCategories(includeArchived = false): Promise<readonly KnowledgeCategory[]> {
  return apiRequest(`${base}/categories${includeArchived ? "?includeArchived=true" : ""}`);
}

export function createKnowledgeCategory(input: SaveKnowledgeCategoryInput): Promise<KnowledgeCategory> {
  return apiRequest(`${base}/categories`, { method: "POST", body: JSON.stringify(input) });
}

export function updateKnowledgeCategory(
  id: string,
  input: SaveKnowledgeCategoryInput,
): Promise<KnowledgeCategory> {
  return apiRequest(`${base}/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function setKnowledgeCategoryArchived(id: string, archived: boolean): Promise<KnowledgeCategory> {
  return apiRequest(`${base}/categories/${id}/${archived ? "archive" : "restore"}`, { method: "POST" });
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
}): Promise<KnowledgeArticleResponse> {
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
    body: JSON.stringify(comment !== undefined && comment.trim().length > 0 ? { rating, comment: comment.trim() } : { rating }),
  });
}
