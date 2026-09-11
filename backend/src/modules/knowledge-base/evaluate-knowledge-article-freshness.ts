import type {
  KnowledgeArticleRecord,
  KnowledgeBaseConfiguration,
} from './knowledge-base.types';

export function evaluateKnowledgeArticleFreshness(
  article: KnowledgeArticleRecord,
  configuration: KnowledgeBaseConfiguration,
  now: Date,
): boolean {
  if (!configuration.reviewCycleEnabled || article.status !== 'PUBLISHED') {
    return false;
  }
  if (article.reviewDueAt !== null && now.getTime() >= article.reviewDueAt.getTime()) {
    return true;
  }
  const origin = article.lastReviewedAt ?? article.publishedAt;
  if (origin === null) {
    return false;
  }
  const staleAfterMs = configuration.staleAfterDays * 24 * 60 * 60 * 1000;
  return now.getTime() >= origin.getTime() + staleAfterMs;
}

export function calculateReviewDueAt(
  from: Date,
  configuration: KnowledgeBaseConfiguration,
): Date | null {
  if (!configuration.reviewCycleEnabled) {
    return null;
  }
  return new Date(
    from.getTime() + configuration.defaultReviewDays * 24 * 60 * 60 * 1000,
  );
}
