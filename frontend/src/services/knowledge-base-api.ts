import { apiRequest } from "@/services/api";

export type KnowledgeArticleStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "PUBLISHED"
  | "ARCHIVED";

export type KnowledgeArticleResponse = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly status: KnowledgeArticleStatus;
  readonly classification: string;
  readonly isStale: boolean;
  readonly reviewDueAt: string | null;
  readonly publishedAt: string | null;
  readonly lastReviewedAt: string | null;
  readonly ownerUserId: string | null;
  readonly ownerGroupId: string | null;
  readonly ownerName?: string | null;
  readonly ownerGroupName?: string | null;
  readonly serviceName?: string | null;
  readonly reviewerUserId: string | null;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly viewerFeedback?: boolean | null;
};

export type KnowledgeInterceptSuggestion = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly bodyPreview: string;
  readonly isStale: boolean;
  readonly score: number;
  readonly viewerFeedback: boolean | null;
};

export type CreateKnowledgeArticleInput = {
  readonly title: string;
  readonly body: string;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly ownerUserId?: string;
  readonly ownerGroupId?: string;
  readonly reviewerUserId?: string;
  readonly classification?: string;
  readonly reason: string;
};

export type UpdateKnowledgeArticleInput = {
  readonly title?: string;
  readonly body?: string;
  readonly ownerUserId?: string | null;
  readonly ownerGroupId?: string | null;
  readonly reviewerUserId?: string | null;
  readonly classification?: string;
  readonly reason: string;
};

export type KnowledgeLifecycleAction =
  | "submit-review"
  | "approve-review"
  | "reject-review"
  | "publish"
  | "archive";

export type ListKnowledgeArticlesParams = {
  readonly q?: string;
  readonly status?: KnowledgeArticleStatus;
  readonly serviceId?: string;
  readonly staleOnly?: boolean;
};

export function listKnowledgeArticles(
  params: ListKnowledgeArticlesParams | string = {},
): Promise<readonly KnowledgeArticleResponse[]> {
  const normalized =
    typeof params === "string"
      ? { serviceId: params.length > 0 ? params : undefined }
      : params;
  const search = new URLSearchParams();
  if (normalized.q !== undefined && normalized.q.trim().length > 0) {
    search.set("q", normalized.q.trim());
  }
  if (normalized.status !== undefined) {
    search.set("status", normalized.status);
  }
  if (
    normalized.serviceId !== undefined &&
    normalized.serviceId.length > 0
  ) {
    search.set("serviceId", normalized.serviceId);
  }
  if (normalized.staleOnly === true) {
    search.set("staleOnly", "true");
  }
  const suffix = search.size === 0 ? "" : `?${search.toString()}`;
  return apiRequest(`/knowledge-base/articles${suffix}`);
}

export function createKnowledgeArticle(
  input: CreateKnowledgeArticleInput,
): Promise<KnowledgeArticleResponse> {
  return apiRequest("/knowledge-base/articles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getKnowledgeArticle(
  articleId: string,
): Promise<KnowledgeArticleResponse> {
  return apiRequest(`/knowledge-base/articles/${articleId}`);
}

export function updateKnowledgeArticle(
  articleId: string,
  input: UpdateKnowledgeArticleInput,
): Promise<KnowledgeArticleResponse> {
  return apiRequest(`/knowledge-base/articles/${articleId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteKnowledgeArticle(
  articleId: string,
  reason: string,
): Promise<void> {
  return apiRequest(`/knowledge-base/articles/${articleId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function runKnowledgeLifecycleAction(
  articleId: string,
  action: KnowledgeLifecycleAction,
  reason: string,
): Promise<KnowledgeArticleResponse> {
  return apiRequest(`/knowledge-base/articles/${articleId}/${action}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function interceptKnowledgeArticles(input: {
  readonly serviceId: string;
  readonly query?: string;
}): Promise<{ readonly articles: readonly KnowledgeInterceptSuggestion[] }> {
  return apiRequest("/knowledge-base/intercept", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resolveKnowledgeIntercept(input: {
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly articleId?: string;
}): Promise<{ readonly id: string }> {
  return apiRequest("/knowledge-base/intercept/resolve", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitKnowledgeFeedback(
  articleId: string,
  isHelpful: boolean,
): Promise<{ readonly isHelpful: boolean }> {
  return apiRequest(`/knowledge-base/articles/${articleId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ isHelpful }),
  });
}
