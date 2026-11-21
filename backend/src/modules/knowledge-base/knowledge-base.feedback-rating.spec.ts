import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { publishedArticleSeed } from './published-article-seed';
import {
  collectRatedArticleIdsOfUser,
  reconcileKnowledgeArticleRatings,
  type KnowledgeFeedbackClient,
} from './knowledge-feedback-rating';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W7.81 (`BA-knowledge-base-07`): `ratingCount`/`ratingSum` are a cached aggregate of the vote rows, and the
 * cache was refreshed *after* the vote in a separate statement that wrote absolute numbers. Two votes finishing
 * out of order could therefore leave the smaller snapshot behind, and votes that left by user cascade never
 * triggered a recount at all.
 *
 * These specs pin the two halves of the repair on the service path: the vote and the recount are **one
 * transaction** (the article row is locked first), and the totals are recomputed **from the rows**, so a vote
 * repairs drift instead of compounding it. The real two-writer race and the cascade path are proven against
 * PostgreSQL in `knowledge-feedback-concurrency.integration.spec.ts`.
 */
function rated(
  memory: ReturnType<typeof createKnowledgeBaseServiceHarness>['memory'],
  articleId: string,
): Pick<KnowledgeArticleRecord, 'ratingCount' | 'ratingSum'> {
  const article = memory.articles.get(articleId);
  expect(article).toBeDefined();
  return {
    ratingCount: article?.ratingCount ?? -1,
    ratingSum: article?.ratingSum ?? -1,
  };
}

describe('Knowledge feedback rating totals (W7.81)', () => {
  it('counts one rating exactly once, whatever the value', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'vpn-reset' }));
    const actor = { actorUserId: knowledgeBaseTestIds.requester };

    await discovery.submitFeedback('vpn-reset', { rating: 5 }, actor);
    expect(rated(memory, 'vpn-reset')).toEqual({ ratingCount: 1, ratingSum: 5 });

    // Changing the same user's rating replaces it; it does not add a second vote.
    await discovery.submitFeedback('vpn-reset', { rating: 2, comment: 'Nedostaje korak' }, actor);
    expect(rated(memory, 'vpn-reset')).toEqual({ ratingCount: 1, ratingSum: 2 });
    expect(memory.feedbacks.size).toBe(1);
  });

  it('adds up ratings from different users', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'vpn-reset' }));

    await discovery.submitFeedback(
      'vpn-reset',
      { rating: 4 },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    await discovery.submitFeedback(
      'vpn-reset',
      { rating: 2 },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(rated(memory, 'vpn-reset')).toEqual({ ratingCount: 2, ratingSum: 6 });
  });

  it('leaves the totals alone for a thumbs-only vote', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'vpn-reset' }));
    const actor = { actorUserId: knowledgeBaseTestIds.requester };

    await discovery.submitFeedback('vpn-reset', { rating: 3 }, actor);
    await discovery.submitFeedback('vpn-reset', { isHelpful: true }, {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    // A thumbs vote is not a rating: the article still has one rated vote of 3.
    expect(rated(memory, 'vpn-reset')).toEqual({ ratingCount: 1, ratingSum: 3 });
  });

  it('heals totals that were already stale when the next rating arrives', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    // A row whose counters no longer match its votes (older drift, or a cascade that was never repaired).
    memory.seedArticle(
      publishedArticleSeed({ id: 'vpn-reset', ratingCount: 9, ratingSum: 41 }),
    );

    await discovery.submitFeedback(
      'vpn-reset',
      { rating: 5 },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(rated(memory, 'vpn-reset')).toEqual({ ratingCount: 1, ratingSum: 5 });
  });

  it('still obeys the one-vote contract when the setting claims every vote counts', async () => {
    const { discovery, memory, configuration } = createKnowledgeBaseServiceHarness();
    configuration.oneVotePerUserPerArticle = false;
    memory.seedArticle(publishedArticleSeed({ id: 'vpn-reset' }));
    const actor = { actorUserId: knowledgeBaseTestIds.requester };

    await discovery.submitFeedback('vpn-reset', { rating: 5 }, actor);
    // `KnowledgeFeedback` has `@@unique([articleId, userId])`, so a second vote of the same user is refused by
    // the database whatever the setting says (`FEEDBACK_DUPLICATE`; `P2002` in production). The setting's
    // "every vote counts" wording therefore cannot be honoured without a migration — documented as remaining
    // risk in the closeout, not changed here.
    await expect(
      discovery.submitFeedback('vpn-reset', { rating: 1 }, actor),
    ).rejects.toThrow('FEEDBACK_DUPLICATE');
    expect(memory.feedbacks.size).toBe(1);
    expect(rated(memory, 'vpn-reset')).toEqual({ ratingCount: 1, ratingSum: 5 });
  });

  it('recounts inside the same transaction as the vote', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'vpn-reset' }));
    let inTransaction = false;
    let aggregateInsideTransaction = false;
    const transaction = memory.prisma.$transaction;
    memory.prisma.$transaction = async (callback: (client: unknown) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await transaction(callback);
      } finally {
        inTransaction = false;
      }
    };
    const aggregate = memory.prisma.knowledgeFeedback.aggregate;
    memory.prisma.knowledgeFeedback.aggregate = async (args: unknown) => {
      aggregateInsideTransaction = inTransaction;
      return aggregate(args as never);
    };

    await discovery.submitFeedback(
      'vpn-reset',
      { rating: 4 },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(aggregateInsideTransaction).toBe(true);
    expect(rated(memory, 'vpn-reset')).toEqual({ ratingCount: 1, ratingSum: 4 });
  });

  it('collects the distinct rated articles of a departing user, ignoring thumbs-only votes', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'article-a' }));
    memory.seedArticle(publishedArticleSeed({ id: 'article-b' }));
    const actor = { actorUserId: knowledgeBaseTestIds.requester };
    await discovery.submitFeedback('article-a', { rating: 5 }, actor);
    await discovery.submitFeedback('article-b', { isHelpful: true }, actor);

    const ids = await collectRatedArticleIdsOfUser(
      memory.prisma as unknown as KnowledgeFeedbackClient,
      knowledgeBaseTestIds.requester,
    );
    expect(ids).toEqual(['article-a']);
  });

  it('recounts every affected article once, and only once', async () => {
    const { memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'article-a', ratingCount: 4, ratingSum: 9 }));
    const updates: string[] = [];
    const update = memory.prisma.knowledgeArticle.update;
    memory.prisma.knowledgeArticle.update = async (args: { where: { id: string } }) => {
      updates.push(args.where.id);
      return update(args as never);
    };

    const repaired = await reconcileKnowledgeArticleRatings(
      memory.prisma as unknown as KnowledgeFeedbackClient,
      ['article-a', 'article-a', '  ', 'article-a'],
    );
    expect(repaired).toBe(1);
    expect(updates).toEqual(['article-a']);
    expect(rated(memory, 'article-a')).toEqual({ ratingCount: 0, ratingSum: 0 });
  });
});
