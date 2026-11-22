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
  // W7.79 (`BA-knowledge-base-05`): the default classification must not hand every article to the whole company.
  internalCompanyWide: false,
};

export const knowledgeBaseConstants = {
  maximumTitleLength: 200,
  maximumBodyLength: 20000,
  maximumSlugLength: 80,
  /** W7.51: retries after a concurrent create took the slug first. */
  slugAllocationAttempts: 3,
  maximumQueryLength: 500,
  interceptLimit: 8,
  /** Val 3 (M14/B5): the ranked list is capped, so the scan is too. */
  interceptCandidateLimit: 500,
  // W7.52 (BA-knowledge-base-04): no read may load an unbounded corpus.
  /** Page size when the caller sends no `limit`. */
  defaultListPageSize: 25,
  /** Hard upper bound for a single page (`limit` above this is rejected). */
  maximumListPageSize: 100,
  /** Rows read from the database per batch inside one page request. */
  listScanBatchSize: 50,
  /** Batches per request: the request never scans more than 200 rows. */
  maximumListScanBatches: 4,
  /** Portal category pages are smaller than the console list. */
  defaultPortalPageSize: 20,
  /**
   * Published rows the portal home may read for category counts and the FAQ.
   * When the corpus is larger the response says `articleCountsComplete: false`
   * instead of scanning further.
   */
  portalHomeScanCap: 200,
  /** Full-text search is offset-paged; deeper pages than this are refused. */
  maximumSearchOffset: 1000,
  // W7.85 (BA-knowledge-base-12): the reminder sweep reads due articles in bounded batches instead of loading the
  // whole backlog into memory, and stops after a bounded number of batches so one run cannot run away.
  /** Due articles read per batch. */
  reminderCandidateBatchSize: 100,
  /** Batches a single sweep may process (≤ 2.000 articles per run). */
  reminderMaximumBatches: 20,
  // W7.90 (`BA-knowledge-base-17`): the curator comment feed was the first 50 rows and said nothing about
  // the rest; it is a page now, and the caller decides whether to ask for more.
  /** Open curator comments per page when the caller sends no `limit`. */
  defaultInsightsCommentPageSize: 20,
  // W7.90: a category page is counted in roots; each root brings its own children, so the tree never splits
  // across pages. An operator tree that needs more than one page is unusual, but the response says so.
  /** Root categories per page when the caller sends no `limit`. */
  defaultCategoryPageSize: 50,
} as const;


export const dataClassificationLevels = [
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
] as const satisfies readonly DataClassification[];
