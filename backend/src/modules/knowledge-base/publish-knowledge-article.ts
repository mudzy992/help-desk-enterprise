import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { assertCanPublishKnowledgeArticle } from './assert-knowledge-article-mutation';
import { assertKnowledgeLifecycleTransition } from './assert-knowledge-lifecycle-transition';
import { calculateReviewDueAt } from './evaluate-knowledge-article-freshness';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeBaseConfiguration } from './knowledge-base.types';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import { loadKnowledgeArticleScope } from './load-knowledge-article-scope';
import { persistStatusChange } from './submit-knowledge-article-review';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
  KnowledgeLifecycleInput,
} from './knowledge-base.types';

export async function publishKnowledgeArticle(
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
  assertCanPublishKnowledgeArticle({ context: actor, scope });
  assertKnowledgeLifecycleTransition(current.status, 'PUBLISHED');
  if (current.lastReviewedAt === null) {
    throw new KnowledgeBaseError('PUBLISH_REVIEW_REQUIRED');
  }
  return persistStatusChange(prisma, current, 'PUBLISHED', input, context, {
    publishedAt: now,
    isStale: false,
    reviewDueAt: current.reviewDueAt ?? calculateReviewDueAt(now, configuration),
  });
}

export async function archiveKnowledgeArticle(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  articleId: string,
  input: KnowledgeLifecycleInput,
  context: KnowledgeArticleMutationContext,
  now: Date,
): Promise<KnowledgeArticleRecord> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const current = await loadKnowledgeArticleRecord(prisma, articleId);
  const scope = await loadKnowledgeArticleScope(prisma, current);
  assertCanPublishKnowledgeArticle({ context: actor, scope });
  assertKnowledgeLifecycleTransition(current.status, 'ARCHIVED');
  return persistStatusChange(prisma, current, 'ARCHIVED', input, context, {
    archivedAt: now,
  });
}
