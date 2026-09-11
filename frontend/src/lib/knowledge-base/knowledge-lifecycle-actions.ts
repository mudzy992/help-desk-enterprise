import type {
  KnowledgeArticleStatus,
  KnowledgeLifecycleAction,
} from "@/services/knowledge-base-api";

export type KnowledgeLifecycleLabelKey =
  | "knowledgeBase.actionSubmitReview"
  | "knowledgeBase.actionApproveReview"
  | "knowledgeBase.actionRejectReview"
  | "knowledgeBase.actionPublish"
  | "knowledgeBase.actionArchive";

export type KnowledgeLifecycleOption = {
  readonly action: KnowledgeLifecycleAction;
  readonly labelKey: KnowledgeLifecycleLabelKey;
};

/// Mirrors the status transitions the knowledge base backend accepts so the UI
/// offers only reachable actions. The backend still validates every request.
const optionsByStatus: Readonly<
  Record<KnowledgeArticleStatus, readonly KnowledgeLifecycleOption[]>
> = {
  DRAFT: [
    { action: "submit-review", labelKey: "knowledgeBase.actionSubmitReview" },
  ],
  IN_REVIEW: [
    { action: "approve-review", labelKey: "knowledgeBase.actionApproveReview" },
    { action: "reject-review", labelKey: "knowledgeBase.actionRejectReview" },
    { action: "publish", labelKey: "knowledgeBase.actionPublish" },
  ],
  PUBLISHED: [
    { action: "approve-review", labelKey: "knowledgeBase.actionApproveReview" },
    { action: "submit-review", labelKey: "knowledgeBase.actionSubmitReview" },
    { action: "archive", labelKey: "knowledgeBase.actionArchive" },
  ],
  ARCHIVED: [],
};

export function knowledgeLifecycleOptions(
  status: KnowledgeArticleStatus,
  canManage: boolean,
): readonly KnowledgeLifecycleOption[] {
  return canManage ? optionsByStatus[status] : [];
}
