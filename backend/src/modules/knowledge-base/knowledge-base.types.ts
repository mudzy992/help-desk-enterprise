import type {
  DataClassification,
  KnowledgeArticleStatus,
} from '../../generated/prisma/enums';

export type KnowledgeBaseConfiguration = {
  readonly interceptEnabled: boolean;
  readonly reviewCycleEnabled: boolean;
  readonly defaultReviewDays: number;
  readonly staleAfterDays: number;
  readonly feedbackEnabled: boolean;
  readonly oneVotePerUserPerArticle: boolean;
  readonly useFeedbackWeight: boolean;
};

export type KnowledgeArticleRecord = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly status: KnowledgeArticleStatus;
  readonly classification: DataClassification;
  readonly isStale: boolean;
  readonly reviewDueAt: Date | null;
  readonly publishedAt: Date | null;
  readonly lastReviewedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly ownerUserId: string | null;
  readonly ownerGroupId: string | null;
  readonly reviewerUserId: string | null;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type KnowledgeArticleResponse = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly status: KnowledgeArticleStatus;
  readonly classification: DataClassification;
  readonly isStale: boolean;
  readonly reviewDueAt: string | null;
  readonly publishedAt: string | null;
  readonly lastReviewedAt: string | null;
  readonly archivedAt: string | null;
  readonly ownerUserId: string | null;
  readonly ownerGroupId: string | null;
  readonly reviewerUserId: string | null;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type KnowledgeArticleMutationContext = {
  readonly actorUserId: string;
};

export type CreateKnowledgeArticleInput = {
  readonly title: string;
  readonly body: string;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly ownerUserId?: string;
  readonly ownerGroupId?: string;
  readonly reviewerUserId?: string;
  readonly classification?: DataClassification;
  readonly reason: string;
};

export type UpdateKnowledgeArticleInput = {
  readonly title?: string;
  readonly body?: string;
  readonly ownerUserId?: string | null;
  readonly ownerGroupId?: string | null;
  readonly reviewerUserId?: string | null;
  readonly classification?: DataClassification;
  readonly reason: string;
};

export type KnowledgeLifecycleInput = {
  readonly reason: string;
};

export type KnowledgeFeedbackInput = {
  readonly isHelpful: boolean;
};

export type KnowledgeInterceptInput = {
  readonly serviceId: string;
  readonly query?: string;
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

export type KnowledgeInterceptResponse = {
  readonly articles: readonly KnowledgeInterceptSuggestion[];
};

export type ListKnowledgeArticlesQuery = {
  readonly serviceId?: string;
  readonly status?: KnowledgeArticleStatus;
  readonly organizationalUnitId?: string;
  readonly q?: string;
};
