import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { assertCanReadKnowledgeArticle } from './can-read-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';
import { updateKnowledgeArticleCounters } from './portal/update-article-counters';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeBaseConfiguration,
  KnowledgeFeedbackInput,
} from './knowledge-base.types';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import {
  loadKnowledgeArticleScope,
  loadOwnerGroupMemberUserIds,
} from './load-knowledge-article-scope';

export type KnowledgeFeedbackResponse = {
  readonly articleId: string;
  readonly userId: string;
  readonly isHelpful: boolean;
  readonly rating: number | null;
  readonly updatedAt: string;
};

export async function submitKnowledgeFeedback(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  configuration: KnowledgeBaseConfiguration,
  articleId: string,
  input: KnowledgeFeedbackInput,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeFeedbackResponse> {
  if (!configuration.feedbackEnabled) {
    throw new KnowledgeBaseError('FEEDBACK_DISABLED');
  }
  const actor = await loadKnowledgeActorContext(loader, context);
  const article = await loadKnowledgeArticleRecord(prisma, articleId);
  const scope = await loadKnowledgeArticleScope(prisma, article);
  const ownerGroupMemberUserIds = await loadOwnerGroupMemberUserIds(
    prisma,
    article.ownerGroupId,
  );
  assertCanReadKnowledgeArticle({
    context: actor,
    article,
    scope,
    ownerGroupMemberUserIds,
    writePermissionKey: permissionKeys.knowledgeArticleWrite,
    reviewPermissionKey: permissionKeys.knowledgeArticleReview,
    publishPermissionKey: permissionKeys.knowledgeArticlePublish,
  });
  const vote = normalizeKnowledgeFeedbackVote(input);
  const persisted = configuration.oneVotePerUserPerArticle
    ? await prisma.knowledgeFeedback.upsert({
        where: {
          articleId_userId: { articleId, userId: context.actorUserId },
        },
        create: { articleId, userId: context.actorUserId, ...vote },
        // A thumbs-only vote (ticket-create intercept) records whether the
        // article solved the problem; it must not erase an earlier 1-5
        // rating or its "what is missing?" comment.
        update:
          vote.rating === null
            ? { isHelpful: vote.isHelpful }
            : { ...vote, commentResolvedAt: null },
      })
    : await prisma.knowledgeFeedback.create({
        data: { articleId, userId: context.actorUserId, ...vote },
      });
  if (vote.rating !== null) {
    await refreshKnowledgeArticleRating(prisma, articleId);
  }
  return {
    articleId: persisted.articleId,
    userId: persisted.userId,
    isHelpful: persisted.isHelpful,
    rating: persisted.rating ?? null,
    updatedAt: persisted.updatedAt.toISOString(),
  };
}

/**
 * Paket 2.9 (K1): a 1-5 rating derives the legacy thumbs flag (>= 4 is
 * helpful) so the old intercept tally and reports keep working. A comment is
 * only kept for low ratings (<= 2, "what is missing?").
 */
export function normalizeKnowledgeFeedbackVote(input: KnowledgeFeedbackInput): {
  readonly isHelpful: boolean;
  readonly rating: number | null;
  readonly comment: string | null;
} {
  const comment =
    typeof input.comment === 'string' && input.comment.trim().length > 0
      ? input.comment.trim()
      : null;
  if (input.rating === undefined) {
    if (typeof input.isHelpful !== 'boolean' || comment !== null) {
      throw new KnowledgeBaseError('INVALID_RATING');
    }
    return { isHelpful: input.isHelpful, rating: null, comment: null };
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new KnowledgeBaseError('INVALID_RATING');
  }
  if (comment !== null && (input.rating > 2 || comment.length > 500)) {
    throw new KnowledgeBaseError('INVALID_RATING');
  }
  return { isHelpful: input.rating >= 4, rating: input.rating, comment };
}

/** Recomputes the article totals from the votes (exact, idempotent). */
export async function refreshKnowledgeArticleRating(
  prisma: PrismaService,
  articleId: string,
): Promise<void> {
  const aggregate = await prisma.knowledgeFeedback.aggregate({
    where: { articleId, rating: { not: null } },
    _count: { rating: true },
    _sum: { rating: true },
  });
  await updateKnowledgeArticleCounters(prisma, articleId, {
    ratingCount: aggregate._count.rating,
    ratingSum: aggregate._sum.rating ?? 0,
  });
}
