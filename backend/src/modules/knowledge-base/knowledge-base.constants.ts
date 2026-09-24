import type {
  DataClassification,
  KnowledgeArticleStatus,
} from '../../generated/prisma/enums';
import type { KnowledgeBaseConfiguration } from './knowledge-base.types';

export const knowledgeArticleStatuses = [
  'DRAFT',
  'IN_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
] as const satisfies readonly KnowledgeArticleStatus[];

export const allowedKnowledgeArticleStatusTransitions: Readonly<
  Record<KnowledgeArticleStatus, readonly KnowledgeArticleStatus[]>
> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['DRAFT', 'PUBLISHED'],
  PUBLISHED: ['IN_REVIEW', 'DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

export const defaultKnowledgeBaseConfiguration: KnowledgeBaseConfiguration = {
  interceptEnabled: true,
  reviewCycleEnabled: true,
  defaultReviewDays: 180,
  staleAfterDays: 365,
  remindDaysBefore: 14,
  feedbackEnabled: true,
  oneVotePerUserPerArticle: true,
  useFeedbackWeight: true,
};

export const knowledgeBaseConstants = {
  maximumTitleLength: 200,
  maximumBodyLength: 20000,
  maximumSlugLength: 80,
  maximumQueryLength: 500,
  interceptLimit: 8,
} as const;


export const dataClassificationLevels = [
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
] as const satisfies readonly DataClassification[];
