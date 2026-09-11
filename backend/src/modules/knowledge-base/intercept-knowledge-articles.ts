import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { knowledgeBaseConstants } from './knowledge-base.constants';
import { KnowledgeBaseError } from './knowledge-base.error';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeBaseConfiguration,
  KnowledgeInterceptInput,
  KnowledgeInterceptResponse,
} from './knowledge-base.types';
import { isKnowledgeArticleVisibleTo } from './load-knowledge-article-scope';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { toArticleRecord } from './load-knowledge-article';
import { normalizeKnowledgeInterceptQuery } from './normalize-knowledge-article-text';
import {
  rankKnowledgeArticles,
  type KnowledgeFeedbackTally,
} from './rank-knowledge-articles';
import { withKnowledgeArticleFreshness } from './with-knowledge-article-freshness';

export async function interceptKnowledgeArticles(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  configuration: KnowledgeBaseConfiguration,
  input: KnowledgeInterceptInput,
  context: KnowledgeArticleMutationContext,
  now: Date,
): Promise<KnowledgeInterceptResponse> {
  const serviceId = input.serviceId.trim();
  if (serviceId.length === 0) {
    throw new KnowledgeBaseError('INTERCEPT_SERVICE_REQUIRED');
  }
  if (!configuration.interceptEnabled) {
    return { articles: [] };
  }
  const actor = await loadKnowledgeActorContext(loader, context);
  const records = await prisma.knowledgeArticle.findMany({
    where: { serviceId, status: 'PUBLISHED' },
  });
  const visible = [];
  for (const record of records) {
    const article = withKnowledgeArticleFreshness(
      toArticleRecord(record),
      configuration,
      now,
    );
    if (await isKnowledgeArticleVisibleTo(prisma, actor, article)) {
      visible.push(article);
    }
  }
  if (visible.length === 0) {
    return { articles: [] };
  }
  const feedbackByArticleId = await loadFeedbackTallies(
    prisma,
    visible.map((article) => article.id),
  );
  const viewerVotes = await loadViewerVotes(
    prisma,
    context.actorUserId,
    visible.map((article) => article.id),
  );
  const ranked = rankKnowledgeArticles({
    articles: visible,
    query: normalizeKnowledgeInterceptQuery(input.query),
    feedbackByArticleId,
    useFeedbackWeight: configuration.useFeedbackWeight,
  });
  return {
    articles: ranked.slice(0, knowledgeBaseConstants.interceptLimit).map((article) => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      bodyPreview: article.body.slice(0, 280),
      isStale: article.isStale,
      score: article.score,
      viewerFeedback: viewerVotes.get(article.id) ?? null,
    })),
  };
}

async function loadFeedbackTallies(
  prisma: PrismaService,
  articleIds: readonly string[],
): Promise<ReadonlyMap<string, KnowledgeFeedbackTally>> {
  const votes = await prisma.knowledgeFeedback.findMany({
    where: { articleId: { in: [...articleIds] } },
    select: { articleId: true, isHelpful: true },
  });
  const tallies = new Map<string, KnowledgeFeedbackTally>();
  for (const vote of votes) {
    const current = tallies.get(vote.articleId) ?? {
      helpfulCount: 0,
      notHelpfulCount: 0,
    };
    tallies.set(vote.articleId, {
      helpfulCount: current.helpfulCount + (vote.isHelpful ? 1 : 0),
      notHelpfulCount: current.notHelpfulCount + (vote.isHelpful ? 0 : 1),
    });
  }
  return tallies;
}

async function loadViewerVotes(
  prisma: PrismaService,
  userId: string,
  articleIds: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  const votes = await prisma.knowledgeFeedback.findMany({
    where: { userId, articleId: { in: [...articleIds] } },
    select: { articleId: true, isHelpful: true },
  });
  return new Map(votes.map((vote) => [vote.articleId, vote.isHelpful]));
}
