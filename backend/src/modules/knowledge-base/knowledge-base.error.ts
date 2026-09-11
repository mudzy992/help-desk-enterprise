export type KnowledgeBaseErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_TITLE'
  | 'INVALID_BODY'
  | 'INVALID_SLUG'
  | 'SERVICE_NOT_FOUND'
  | 'SERVICE_REQUIRED'
  | 'ORGANIZATIONAL_UNIT_NOT_FOUND'
  | 'ORGANIZATIONAL_UNIT_REQUIRED'
  | 'OWNERSHIP_REQUIRED'
  | 'OWNER_USER_NOT_FOUND'
  | 'OWNER_GROUP_NOT_FOUND'
  | 'REVIEWER_REQUIRED'
  | 'REVIEWER_NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'PUBLISH_REVIEW_REQUIRED'
  | 'ARTICLE_ARCHIVED'
  | 'FEEDBACK_DISABLED'
  | 'INTERCEPT_SERVICE_REQUIRED'
  | 'REASON_REQUIRED'
  | 'SLUG_TAKEN';

export class KnowledgeBaseError extends Error {
  constructor(
    readonly code: KnowledgeBaseErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'KnowledgeBaseError';
  }
}
