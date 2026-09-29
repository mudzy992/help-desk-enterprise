import { createKnowledgeBaseServiceHarness, knowledgeBaseTestIds } from '../create-knowledge-base-service-harness';
import { publishedArticleSeed } from '../published-article-seed';
import { knowledgeRatingBonus } from '../rank-knowledge-articles';
import { flushKnowledgeArticleViews, knowledgeViewKeys } from './knowledge-article-views';
import { KnowledgePortalService } from './knowledge-portal.service';

type Category = {
  id: string;
  key: string;
  nameBs: string;
  nameEn: string;
  icon: string;
  sortOrder: number;
  parentId: string | null;
  isArchived: boolean;
};

/** Minimal Redis double: the commands the view counter uses. */
function createFakeRedis() {
  const strings = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  const set = (key: string) => sets.get(key) ?? sets.set(key, new Set()).get(key)!;
  const client = {
    failing: false,
    multi() {
      const ops: (() => unknown)[] = [];
      const chain = {
        pfadd: (key: string, member: string) => (ops.push(() => set(`hll:${key}`).add(member)), chain),
        incr: (key: string) => (ops.push(() => strings.set(key, (strings.get(key) ?? 0) + 1)), chain),
        sadd: (key: string, member: string) => (ops.push(() => set(key).add(member)), chain),
        expire: () => (ops.push(() => 1), chain),
        exec: async () => {
          if (client.failing) throw new Error('NOPERM');
          return ops.map((op) => [null, op()]);
        },
      };
      return chain;
    },
    smembers: async (key: string) => [...(sets.get(key) ?? [])],
    get: async (key: string) => (strings.has(key) ? String(strings.get(key)) : null),
    pfcount: async (key: string) => sets.get(`hll:${key}`)?.size ?? 0,
    del: async (...keys: string[]) => {
      for (const key of keys) {
        strings.delete(key);
        sets.delete(key);
        sets.delete(`hll:${key}`);
      }
      return keys.length;
    },
    srem: async (key: string, member: string) => (sets.get(key)?.delete(member) ? 1 : 0),
    sets,
    strings,
  };
  return client;
}

function createPortalHarness(settings: Record<string, unknown> = {}) {
  const harness = createKnowledgeBaseServiceHarness();
  const categories = new Map<string, Category>();
  const views = new Map<string, { articleId: string; day: Date; views: number; uniqueViewers: number }>();
  const audits: unknown[] = [];
  let sequence = 0;
  const prisma = harness.memory.prisma as unknown as Record<string, unknown>;
  const matchCategory = (row: Category, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value);
  prisma.knowledgeCategory = {
    findMany: async ({ where }: { where?: Record<string, unknown> }) =>
      [...categories.values()].filter((row) => matchCategory(row, where)).sort((a, b) => a.sortOrder - b.sortOrder),
    findUnique: async ({ where }: { where: { id?: string; key?: string } }) =>
      [...categories.values()].find((row) => (where.id ? row.id === where.id : row.key === where.key)) ?? null,
    count: async ({ where }: { where?: Record<string, unknown> }) =>
      [...categories.values()].filter((row) => matchCategory(row, where)).length,
    create: async ({ data }: { data: Omit<Category, 'id' | 'isArchived'> }) => {
      const row = { id: `cat-${++sequence}`, isArchived: false, ...data };
      categories.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Category> }) => {
      const row = { ...categories.get(where.id)!, ...data };
      categories.set(row.id, row);
      return row;
    },
  };
  prisma.knowledgeArticleView = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { articleId_day: { articleId: string; day: Date } };
      create: { articleId: string; day: Date; views: number; uniqueViewers: number };
      update: { views: { increment: number }; uniqueViewers: { increment: number } };
    }) => {
      const key = `${where.articleId_day.articleId}:${where.articleId_day.day.toISOString()}`;
      const current = views.get(key);
      views.set(
        key,
        current === undefined
          ? { ...create }
          : {
              ...current,
              views: current.views + update.views.increment,
              uniqueViewers: current.uniqueViewers + update.uniqueViewers.increment,
            },
      );
    },
    groupBy: async () =>
      [...views.values()].reduce<{ articleId: string; _sum: { views: number } }[]>((rows, row) => {
        const existing = rows.find((item) => item.articleId === row.articleId);
        if (existing) existing._sum.views += row.views;
        else rows.push({ articleId: row.articleId, _sum: { views: row.views } });
        return rows;
      }, []),
  };
  prisma.$executeRaw = async () => 0;
  prisma.auditLog = {
    findFirst: async () => null,
    create: async ({ data }: { data: unknown }) => audits.push(data),
  };
  const redis = createFakeRedis();
  const service = new KnowledgePortalService(
    harness.memory.prisma as never,
    { loadBySubjectId: async (id: string) => harness.contexts.get(id) ?? null } as never,
    { load: async () => ({ ...harness.configuration }) } as never,
    { getSetting: async (key: string) => settings[key] } as never,
    { getClient: () => redis } as never,
  );
  return { ...harness, service, categories, views, audits, redis };
}

const asUser = (actorUserId: string) => ({ actorUserId });
const superAdmin = asUser(knowledgeBaseTestIds.superAdmin);

describe('KnowledgePortalService (Paket 2.9, K1)', () => {
  it('lets only category managers create categories and keeps one level', async () => {
    const { service, audits } = createPortalHarness();
    await expect(
      service.createCategory({ key: 'vpn', nameBs: 'VPN', nameEn: 'VPN' }, asUser(knowledgeBaseTestIds.requester)),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    const root = await service.createCategory({ key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi' }, superAdmin);
    const child = await service.createCategory(
      { key: 'vpn', nameBs: 'VPN', nameEn: 'VPN', parentId: root.id },
      superAdmin,
    );
    await expect(
      service.createCategory({ key: 'deep', nameBs: 'Dublje', nameEn: 'Deeper', parentId: child.id }, superAdmin),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CATEGORY' } });
    await expect(
      service.createCategory({ key: 'vpn', nameBs: 'Opet', nameEn: 'Again' }, superAdmin),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_KEY_TAKEN' } });
    await expect(service.setCategoryArchived(root.id, true, superAdmin)).rejects.toMatchObject({
      response: { code: 'CATEGORY_NOT_EMPTY' },
    });
    await service.setCategoryArchived(child.id, true, superAdmin);
    await service.setCategoryArchived(root.id, true, superAdmin);
    expect(audits).toHaveLength(4);
  });

  it('builds the home page: counts include subcategories, FAQ is ordered and capped', async () => {
    const { service, memory, categories } = createPortalHarness({
      'private.knowledgeBase.portal.faqMaxItems': 2,
    });
    categories.set('root', { id: 'root', key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    categories.set('child', { id: 'child', key: 'vpn', nameBs: 'VPN', nameEn: 'VPN', icon: 'shield', sortOrder: 1, parentId: 'root', isArchived: false });
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1', title: 'Alpha', categoryId: 'root', isFaq: true, faqOrder: 2 }));
    memory.seedArticle(publishedArticleSeed({ id: 'a2', slug: 'a2', title: 'Beta', categoryId: 'child', isFaq: true, faqOrder: 1 }));
    memory.seedArticle(publishedArticleSeed({ id: 'a3', slug: 'a3', title: 'Gamma', isFaq: true, viewCount: 99 }));
    memory.seedArticle(publishedArticleSeed({ id: 'a4', slug: 'a4', title: 'Draft', status: 'DRAFT', categoryId: 'root' }));
    const home = await service.home(asUser(knowledgeBaseTestIds.requester));
    expect(home.categories.find((item) => item.id === 'root')?.articleCount).toBe(2);
    expect(home.categories.find((item) => item.id === 'child')?.articleCount).toBe(1);
    expect(home.uncategorizedCount).toBe(1);
    expect(home.faq.map((item) => item.id)).toEqual(['a2', 'a1']);
    expect(home.capabilities).toEqual({ canManageCategories: false, canCurate: false, canDraftFromReply: false });
    const inRoot = await service.categoryArticles('root', asUser(knowledgeBaseTestIds.requester));
    expect(inRoot.map((item) => item.id)).toEqual(['a1', 'a2']);
    const loose = await service.categoryArticles('uncategorized', asUser(knowledgeBaseTestIds.requester));
    expect(loose.map((item) => item.id)).toEqual(['a3']);
  });

  it('places articles for writers only and records the change', async () => {
    const { service, memory, categories } = createPortalHarness();
    categories.set('root', { id: 'root', key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    categories.set('old', { id: 'old', key: 'staro', nameBs: 'Staro', nameEn: 'Old', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: true });
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    await expect(
      service.placeArticle('a1', { categoryId: 'root', reason: 'x' }, asUser(knowledgeBaseTestIds.requester)),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      service.placeArticle('a1', { categoryId: 'old', reason: 'x' }, asUser(knowledgeBaseTestIds.agentIt)),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CATEGORY' } });
    const placed = await service.placeArticle(
      'a1',
      { categoryId: 'root', isFaq: true, faqOrder: 3, reason: 'Portal' },
      asUser(knowledgeBaseTestIds.agentIt),
    );
    expect(placed).toMatchObject({ categoryId: 'root', isFaq: true, faqOrder: 3, status: 'PUBLISHED' });
    expect(memory.changeLogs.length).toBeGreaterThan(0);
    const unfaq = await service.placeArticle('a1', { isFaq: false, reason: 'x' }, asUser(knowledgeBaseTestIds.agentIt));
    expect(unfaq.faqOrder).toBeNull();
  });

  it('counts published views in Redis, flushes finished days and falls back to the database', async () => {
    const { service, memory, redis, views } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    memory.seedArticle(publishedArticleSeed({ id: 'a2', slug: 'a2', status: 'DRAFT' }));
    await service.recordView('a1', asUser(knowledgeBaseTestIds.requester));
    await service.recordView('a1', asUser(knowledgeBaseTestIds.requester));
    await service.recordView('a1', asUser(knowledgeBaseTestIds.agentIt));
    await service.recordView('a2', asUser(knowledgeBaseTestIds.agentIt));
    const today = new Date().toISOString().slice(0, 10);
    expect(redis.strings.get(knowledgeViewKeys.counter(today, 'a1'))).toBe(3);
    expect(redis.strings.has(knowledgeViewKeys.counter(today, 'a2'))).toBe(false);
    // Today is not finished: nothing to flush yet.
    expect(await flushKnowledgeArticleViews({ prisma: memory.prisma as never, redis: redis as never, now: new Date() })).toBe(0);
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(await flushKnowledgeArticleViews({ prisma: memory.prisma as never, redis: redis as never, now: tomorrow })).toBe(1);
    expect([...views.values()][0]).toMatchObject({ articleId: 'a1', views: 3, uniqueViewers: 2 });
    expect(memory.articles.get('a1')?.viewCount).toBe(3);
    expect(redis.sets.get(knowledgeViewKeys.pendingDays)?.size ?? 0).toBe(0);

    redis.failing = true;
    await service.recordView('a1', asUser(knowledgeBaseTestIds.requester));
    expect(memory.articles.get('a1')?.viewCount).toBe(4);
  });

  it('shows insights to curators only: lowest rated needs at least 5 votes', async () => {
    const { service, memory } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'good', slug: 'good', ratingCount: 10, ratingSum: 45 }));
    memory.seedArticle(publishedArticleSeed({ id: 'bad', slug: 'bad', ratingCount: 6, ratingSum: 9 }));
    memory.seedArticle(publishedArticleSeed({ id: 'few', slug: 'few', ratingCount: 2, ratingSum: 2 }));
    await expect(service.insights(asUser(knowledgeBaseTestIds.requester))).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    const insights = await service.insights(asUser(knowledgeBaseTestIds.agentIt));
    expect(insights.lowestRated.map((item) => item.id)).toEqual(['bad', 'good']);
    expect(insights.thresholds).toEqual({ minRatings: 5, notViewedDays: 90 });
  });
});

describe('1-5 ratings (K1b)', () => {
  it('keeps exact totals, derives the thumbs flag and accepts a comment only for low ratings', async () => {
    const { discovery, memory } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    const requester = asUser(knowledgeBaseTestIds.requester);
    const first = await discovery.submitFeedback('a1', { rating: 5 }, requester);
    expect(first).toMatchObject({ rating: 5, isHelpful: true });
    await expect(
      discovery.submitFeedback('a1', { rating: 4, comment: 'Nedostaje korak' }, requester),
    ).rejects.toMatchObject({ response: { code: 'INVALID_RATING' } });
    const second = await discovery.submitFeedback('a1', { rating: 2, comment: ' Nedostaje korak 3 ' }, requester);
    expect(second).toMatchObject({ rating: 2, isHelpful: false });
    await discovery.submitFeedback('a1', { rating: 4 }, asUser(knowledgeBaseTestIds.agentIt));
    expect(memory.articles.get('a1')).toMatchObject({ ratingCount: 2, ratingSum: 6 });
    const stored = [...memory.feedbacks.values()].find((row) => row.userId === knowledgeBaseTestIds.requester);
    expect(stored?.comment).toBe('Nedostaje korak 3');
    // Legacy thumbs still work (no rating).
    await discovery.submitFeedback('a1', { isHelpful: true }, asUser(knowledgeBaseTestIds.adminIt));
    expect(memory.articles.get('a1')).toMatchObject({ ratingCount: 2, ratingSum: 6 });
  });

  it('pulls few-vote ratings to the prior (Bayesian bonus)', () => {
    expect(knowledgeRatingBonus(0, 0)).toBe(0);
    expect(knowledgeRatingBonus(1, 5)).toBeLessThan(knowledgeRatingBonus(40, 184));
    expect(knowledgeRatingBonus(6, 9)).toBeLessThan(0);
  });
});
