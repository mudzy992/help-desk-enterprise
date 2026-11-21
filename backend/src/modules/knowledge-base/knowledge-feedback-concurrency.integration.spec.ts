import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { createTestAuthorizationContext } from '../authorization/create-test-authorization-context';
import {
  collectRatedArticleIdsOfUser,
  reconcileKnowledgeArticleRatings,
} from './knowledge-feedback-rating';
import { submitKnowledgeFeedback } from './submit-knowledge-feedback';
import type { KnowledgeBaseConfiguration } from './knowledge-base.types';

/**
 * W7.81 (`BA-knowledge-base-07`): the rating totals are a cached aggregate, and the guarantees behind them are
 * database facts, not conventions — one writer at a time per article, one vote per user, an exact recount and
 * a repair after votes leave by cascade. The unit specs cover the ordering inside the service; this file proves
 * the substrate under a real PostgreSQL, where two writers actually race.
 *
 * The votes disappear with their user (`KnowledgeFeedback.userId` is `onDelete: Cascade`), so the cascade case
 * runs the same two calls `deleteUser` makes, in the same order, inside one transaction.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

const configuration: KnowledgeBaseConfiguration = {
  interceptEnabled: true,
  reviewCycleEnabled: false,
  defaultReviewDays: 90,
  staleAfterDays: 180,
  remindDaysBefore: 7,
  feedbackEnabled: true,
  oneVotePerUserPerArticle: true,
  useFeedbackWeight: true,
  internalCompanyWide: true,
};

describeIfDatabase('knowledge feedback rating concurrency (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let categoryId = '';
  let serviceId = '';
  let articleId = '';
  const userIds: string[] = [];

  beforeAll(async () => {
    const suffix = `${process.pid}-${Date.now()}`;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT knowledge ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-knowledge-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-knowledge-${suffix}`,
      },
    });
    organizationalUnitId = unit.id;
    const category = await database().serviceCategory.create({
      data: { name: `IT knowledge category ${suffix}`, slug: `it-knowledge-cat-${suffix}` },
    });
    categoryId = category.id;
    const service = await database().service.create({
      data: { name: `IT knowledge service ${suffix}`, slug: `it-knowledge-svc-${suffix}`, categoryId },
    });
    serviceId = service.id;
    const article = await database().knowledgeArticle.create({
      data: {
        slug: `it-knowledge-article-${suffix}`,
        title: 'IT knowledge article',
        body: 'Body of the article under test.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        serviceId,
        organizationalUnitId,
      },
      select: { id: true },
    });
    articleId = article.id;
    for (let index = 0; index < 8; index += 1) {
      const user = await database().user.create({
        data: {
          email: `it-kb-voter-${index}-${suffix}@example.test`,
          displayName: `IT KB voter ${index}`,
        },
      });
      userIds.push(user.id);
    }
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (articleId !== '') await db.knowledgeArticle.delete({ where: { id: articleId } });
    if (serviceId !== '') await db.service.delete({ where: { id: serviceId } });
    if (categoryId !== '') await db.serviceCategory.delete({ where: { id: categoryId } });
    if (userIds.length > 0) await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationalUnitId !== '') {
      await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    }
    await db.$disconnect();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  /** A plain signed-in user: the INTERNAL audience is company-wide in this fixture, so visibility is not the subject. */
  const loader = {
    loadBySubjectId: async (subjectId: string) =>
      createTestAuthorizationContext({ subjectId }),
  };

  async function vote(userId: string, rating: number): Promise<unknown> {
    return submitKnowledgeFeedback(
      database() as never,
      loader as never,
      configuration,
      articleId,
      { rating },
      { actorUserId: userId },
    );
  }

  async function totals() {
    const row = await database().knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { ratingCount: true, ratingSum: true },
    });
    return { ratingCount: row?.ratingCount ?? -1, ratingSum: row?.ratingSum ?? -1 };
  }

  it('keeps the totals exact when eight votes arrive together', async () => {
    await Promise.all(userIds.map((userId) => vote(userId, 4)));

    const votes = await database().knowledgeFeedback.count({ where: { articleId } });
    expect(votes).toBe(userIds.length);
    expect(await totals()).toEqual({ ratingCount: 8, ratingSum: 32 });
  });

  it('keeps one vote per user under two concurrent submissions of the same user', async () => {
    const [userId] = userIds;
    const results = await Promise.allSettled([vote(userId!, 2), vote(userId!, 5)]);

    const row = await database().knowledgeFeedback.findUnique({
      where: { articleId_userId: { articleId, userId: userId! } },
      select: { rating: true },
    });
    expect(row).not.toBeNull();
    expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThan(0);
    // Whatever order the two writers finished in, the totals describe the row that is actually stored.
    const rated = await database().knowledgeFeedback.aggregate({
      where: { articleId, rating: { not: null } },
      _count: { rating: true },
      _sum: { rating: true },
    });
    expect(await totals()).toEqual({
      ratingCount: rated._count.rating,
      ratingSum: rated._sum.rating ?? 0,
    });
  });

  it('repairs the totals after a user takes their votes with them', async () => {
    const [leavingUser] = userIds;
    const articleIds = await collectRatedArticleIdsOfUser(
      database() as never,
      leavingUser!,
    );
    expect(articleIds).toContain(articleId);

    await database().$transaction(async (transaction) => {
      await transaction.user.delete({ where: { id: leavingUser! } });
      await reconcileKnowledgeArticleRatings(transaction as never, articleIds);
    });
    userIds.shift();

    const remaining = await database().knowledgeFeedback.aggregate({
      where: { articleId, rating: { not: null } },
      _count: { rating: true },
      _sum: { rating: true },
    });
    expect(await totals()).toEqual({
      ratingCount: remaining._count.rating,
      ratingSum: remaining._sum.rating ?? 0,
    });
  });

  it('heals totals that were already stale when the next rating arrives', async () => {
    await database().knowledgeArticle.update({
      where: { id: articleId },
      data: { ratingCount: 99, ratingSum: 999 },
    });
    const fresh = await database().user.create({
      data: { email: `it-kb-late-${process.pid}-${Date.now()}@example.test`, displayName: 'Late voter' },
    });
    userIds.push(fresh.id);

    await vote(fresh.id, 3);

    const rated = await database().knowledgeFeedback.aggregate({
      where: { articleId, rating: { not: null } },
      _count: { rating: true },
      _sum: { rating: true },
    });
    expect(await totals()).toEqual({
      ratingCount: rated._count.rating,
      ratingSum: rated._sum.rating ?? 0,
    });
    expect((await totals()).ratingCount).toBeLessThan(99);
  });
});
