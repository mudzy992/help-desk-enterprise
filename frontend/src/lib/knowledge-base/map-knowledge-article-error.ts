import { ApiError } from "@/services/api";

export type KnowledgeArticleErrorKey =
  | "knowledgeBase.errorUnauthorized"
  | "knowledgeBase.errorForbidden"
  | "knowledgeBase.errorNotFound"
  | "knowledgeBase.errorValidation"
  | "knowledgeBase.errorGeneric"
  // Paket 2.9 (K1).
  | "knowledgeBase.errorCategory"
  | "knowledgeBase.errorSourceMessage"
  | "knowledgeBase.errorRating";

const codeKeys: Partial<Record<string, KnowledgeArticleErrorKey>> = {
  INVALID_CREDENTIALS: "knowledgeBase.errorUnauthorized",
  FORBIDDEN: "knowledgeBase.errorForbidden",
  ARTICLE_ARCHIVED: "knowledgeBase.errorForbidden",
  FEEDBACK_DISABLED: "knowledgeBase.errorForbidden",
  NOT_FOUND: "knowledgeBase.errorNotFound",
  SERVICE_NOT_FOUND: "knowledgeBase.errorNotFound",
  ORGANIZATIONAL_UNIT_NOT_FOUND: "knowledgeBase.errorNotFound",
  OWNER_USER_NOT_FOUND: "knowledgeBase.errorNotFound",
  OWNER_GROUP_NOT_FOUND: "knowledgeBase.errorNotFound",
  REVIEWER_NOT_FOUND: "knowledgeBase.errorNotFound",
  REASON_REQUIRED: "knowledgeBase.errorValidation",
  INVALID_TITLE: "knowledgeBase.errorValidation",
  INVALID_BODY: "knowledgeBase.errorValidation",
  INVALID_SLUG: "knowledgeBase.errorValidation",
  INVALID_CATEGORY: "knowledgeBase.errorCategory",
  CATEGORY_KEY_TAKEN: "knowledgeBase.errorCategory",
  CATEGORY_NOT_EMPTY: "knowledgeBase.errorCategory",
  CATEGORY_NOT_FOUND: "knowledgeBase.errorNotFound",
  SOURCE_TICKET_NOT_FOUND: "knowledgeBase.errorNotFound",
  SOURCE_MESSAGE_NOT_FOUND: "knowledgeBase.errorNotFound",
  SOURCE_MESSAGE_NOT_PUBLIC: "knowledgeBase.errorSourceMessage",
  INVALID_RATING: "knowledgeBase.errorRating",
};

export function mapKnowledgeArticleError(
  error: unknown,
): KnowledgeArticleErrorKey {
  if (!(error instanceof ApiError)) {
    return "knowledgeBase.errorGeneric";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (error.status === 401) {
    return "knowledgeBase.errorUnauthorized";
  }
  if (error.status === 403) {
    return "knowledgeBase.errorForbidden";
  }
  if (error.status === 404) {
    return "knowledgeBase.errorNotFound";
  }
  if (error.status === 400 || error.status === 422) {
    return "knowledgeBase.errorValidation";
  }
  return "knowledgeBase.errorGeneric";
}
