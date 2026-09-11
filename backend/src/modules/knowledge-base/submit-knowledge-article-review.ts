import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { assertCanWriteKnowledgeArticle } from './assert-knowledge-article-mutation';
import { assertKnowledgeLifecycleTransition } from './assert-knowledge-lifecycle-transition';
import { KnowledgeBaseError } from './knowledge-base.error';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import {
  loadKnowledgeArticleRecord,
  toArticleRecord,
} from './load-knowledge-article';
import {
  loadKnowledgeArticleScope,
  loadOwnerGroupMemberUserIds,
} from './load-knowledge-article-scope';
import {
  changeLogActions,
  recordKnowledgeArticleChange,
} from './record-knowledge-article-change';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
  KnowledgeLifecycleInput,
} from './knowledge-base.types';

export async function submitKnowledgeArticleReview(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  articleId: string,
  input: KnowledgeLifecycleInput,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeArticleRecord> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const current = await loadKnowledgeArticleRecord(prisma, articleId);
  const scope = await loadKnowledgeArticleScope(prisma, current);
  const ownerGroupMemberUserIds = await loadOwnerGroupMemberUserIds(
    prisma,
    current.ownerGroupId,
  );
  assertCanWriteKnowledgeArticle({
    context: actor,
    article: current,
    scope,
    ownerGroupMemberUserIds,
  });
  if (current.reviewerUserId === null) {
    throw new KnowledgeBaseError('REVIEWER_REQUIRED');
  }
  assertKnowledgeLifecycleTransition(current.status, 'IN_REVIEW');
  return persistStatusChange(prisma, current, 'IN_REVIEW', input, context);
}

export async function persistStatusChange(
  prisma: PrismaService,
  current: KnowledgeArticleRecord,
  status: KnowledgeArticleRecord['status'],
  input: KnowledgeLifecycleInput,
  context: KnowledgeArticleMutationContext,
  extra: Partial<KnowledgeArticleRecord> = {},
): Promise<KnowledgeArticleRecord> {
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.knowledgeArticle.update({
      where: { id: current.id },
      data: {
        status,
        isStale: extra.isStale ?? current.isStale,
        reviewDueAt: extra.reviewDueAt ?? current.reviewDueAt,
        publishedAt: extra.publishedAt ?? current.publishedAt,
        lastReviewedAt: extra.lastReviewedAt ?? current.lastReviewedAt,
        archivedAt: extra.archivedAt ?? current.archivedAt,
      },
    });
    const record = toArticleRecord(updated);
    await recordKnowledgeArticleChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason: input.reason,
      before: current,
      after: record,
      actorUserId: context.actorUserId,
    });
    return record;
  });
}
