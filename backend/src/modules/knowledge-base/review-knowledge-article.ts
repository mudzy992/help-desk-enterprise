import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { assertCanReviewKnowledgeArticle } from './assert-knowledge-article-mutation';
import { assertKnowledgeLifecycleTransition } from './assert-knowledge-lifecycle-transition';
import { calculateReviewDueAt } from './evaluate-knowledge-article-freshness';
import { KnowledgeBaseError } from './knowledge-base.error';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import { loadKnowledgeArticleScope } from './load-knowledge-article-scope';
import { persistStatusChange } from './submit-knowledge-article-review';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
  KnowledgeBaseConfiguration,
  KnowledgeLifecycleInput,
} from './knowledge-base.types';

export async function approveKnowledgeArticleReview(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  configuration: KnowledgeBaseConfiguration,
  articleId: string,
  input: KnowledgeLifecycleInput,
  context: KnowledgeArticleMutationContext,
  now: Date,
): Promise<KnowledgeArticleRecord> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const current = await loadKnowledgeArticleRecord(prisma, articleId);
  const scope = await loadKnowledgeArticleScope(prisma, current);
  assertCanReviewKnowledgeArticle({ context: actor, article: current, scope });
  if (current.status !== 'IN_REVIEW' && current.status !== 'PUBLISHED') {
    throw new KnowledgeBaseError('INVALID_STATUS_TRANSITION');
  }
  return persistStatusChange(prisma, current, current.status, input, context, {
    lastReviewedAt: now,
    reviewDueAt: calculateReviewDueAt(now, configuration),
    isStale: false,
  });
}

export async function rejectKnowledgeArticleReview(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  articleId: string,
  input: KnowledgeLifecycleInput,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeArticleRecord> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const current = await loadKnowledgeArticleRecord(prisma, articleId);
  const scope = await loadKnowledgeArticleScope(prisma, current);
  assertCanReviewKnowledgeArticle({ context: actor, article: current, scope });
  assertKnowledgeLifecycleTransition(current.status, 'DRAFT');
  return persistStatusChange(prisma, current, 'DRAFT', input, context);
}
