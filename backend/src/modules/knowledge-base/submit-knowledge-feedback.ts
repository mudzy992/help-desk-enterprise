import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { KnowledgeBaseError } from './knowledge-base.error';
import {
  lockKnowledgeArticleRating,
  reconcileKnowledgeArticleRating,
  type KnowledgeFeedbackClient,
} from './knowledge-feedback-rating';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeBaseConfiguration,
  KnowledgeFeedbackInput,
} from './knowledge-base.types';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import { isKnowledgeArticleVisibleTo } from './load-knowledge-article-scope';

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
  // W7.60 (BA-search-06): voting on an article is a read of it — the feedback
  // endpoint therefore uses the same visibility loader as `/search`, the list
  // and the detail read instead of assembling the predicate facts again.
  if (!(await isKnowledgeArticleVisibleTo(prisma, actor, article, configuration))) {
    throw new KnowledgeBaseError('FORBIDDEN');
  }
  const vote = normalizeKnowledgeFeedbackVote(input);
  // W7.81 (`BA-knowledge-base-07`): the vote and the totals it changes are one transaction, serialised per
  // article. Writing them apart let two votes finish out of order and leave the smaller snapshot on the row;
  // the totals are recomputed from the rows inside the same transaction, so a vote also heals older drift.
  const persisted = await prisma.$transaction(async (transaction) => {
    const client = transaction as unknown as KnowledgeFeedbackClient;
    await lockKnowledgeArticleRating(client, articleId);
    const row = configuration.oneVotePerUserPerArticle
      ? await transaction.knowledgeFeedback.upsert({
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
      : await transaction.knowledgeFeedback.create({
          data: { articleId, userId: context.actorUserId, ...vote },
        });
    // A thumbs-only vote never entered the rating totals, so it does not pay for the recount.
    if (vote.rating !== null) {
      await reconcileKnowledgeArticleRating(client, articleId);
    }
    return row;
  });
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
