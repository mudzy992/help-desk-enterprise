import {
  flushKnowledgeArticleViews,
  knowledgeViewKeys,
  recordKnowledgeArticleView,
} from './knowledge-article-views';

/**
 * W7.89 (`BA-knowledge-base-16`): the view flush used to be an increment, so a crash
 * between the database commit and the Redis delete counted that day twice, and the
 * Redis-less path counted every visit as a new viewer. These tests pin the two
 * properties that replaced it: the day is written as an absolute value (a retry is a
 * no-op) and the fallback never claims a viewer it cannot deduplicate.
 */

type DayRow = { readonly articleId: string; readonly day: Date; views: number; uniqueViewers: number };

function createFakePrisma(options: { readonly rawLock?: boolean; readonly failUpsertWith?: string } = {}) {
  const days = new Map<string, DayRow>();
  const articles = new Map<string, { viewCount: number; lastViewedAt: Date | null }>();
  const calls: string[] = [];
  const keyOf = (articleId: string, day: Date) => `${articleId}:${day.toISOString()}`;

  const client = {
    calls,
    days,
    articles,
    $queryRawUnsafe:
      options.rawLock === true
        ? async (query: string) => {
            calls.push(`raw:${query}`);
            return [{ 'pg_advisory_xact_lock': null }];
          }
        : undefined,
    $transaction: async <T>(work: (transaction: unknown) => Promise<T>): Promise<T> => work(client),
    knowledgeArticleView: {
      findUnique: async ({ where }: { where: { articleId_day: { articleId: string; day: Date } } }) => {
        calls.push('findUnique');
        return days.get(keyOf(where.articleId_day.articleId, where.articleId_day.day)) ?? null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { articleId_day: { articleId: string; day: Date } };
        create: DayRow;
        update: { views: number | { increment: number }; uniqueViewers?: number };
      }) => {
        calls.push('upsert');
        if (options.failUpsertWith !== undefined) {
          throw Object.assign(new Error('simulated'), { code: options.failUpsertWith });
        }
        const key = keyOf(where.articleId_day.articleId, where.articleId_day.day);
        const current = days.get(key);
        if (current === undefined) {
          days.set(key, { ...create });
          return;
        }
        const nextViews = typeof update.views === 'number' ? update.views : current.views + update.views.increment;
        const nextUniqueViewers =
          typeof update.views === 'number' ? (update.uniqueViewers ?? current.uniqueViewers) : current.uniqueViewers;
        days.set(key, { ...current, views: nextViews, uniqueViewers: nextUniqueViewers });
      },
    },
    knowledgeArticle: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { viewCount?: { increment: number }; lastViewedAt?: Date };
      }) => {
        calls.push('article.update');
        const current = articles.get(where.id) ?? { viewCount: 0, lastViewedAt: null };
        articles.set(where.id, {
          viewCount: current.viewCount + (data.viewCount?.increment ?? 0),
          lastViewedAt: data.lastViewedAt ?? current.lastViewedAt,
        });
        return articles.get(where.id);
      },
    },
  };
  return client;
}

/** Minimal Redis double for the view counters, with a switch to replay a crash. */
function createFakeRedis() {
  const counters = new Map<string, number>();
  const viewers = new Map<string, Set<string>>();
  const sets = new Map<string, Set<string>>();
  const set = (key: string) => sets.get(key) ?? sets.set(key, new Set()).get(key)!;
  const client = {
    multi() {
      const ops: (() => unknown)[] = [];
      const chain = {
        pfadd: (key: string, member: string) => {
          ops.push(() => (viewers.get(key) ?? viewers.set(key, new Set()).get(key)!).add(member));
          return chain;
        },
        incr: (key: string) => {
          ops.push(() => counters.set(key, (counters.get(key) ?? 0) + 1));
          return chain;
        },
        sadd: (key: string, member: string) => {
          ops.push(() => set(key).add(member));
          return chain;
        },
        expire: () => {
          ops.push(() => 1);
          return chain;
        },
        exec: async () => ops.map((op) => [null, op()]),
      };
      return chain;
    },
    smembers: async (key: string) => [...(sets.get(key) ?? [])],
    get: async (key: string) => (counters.has(key) ? String(counters.get(key)) : null),
    pfcount: async (key: string) => viewers.get(key)?.size ?? 0,
    del: async (...keys: string[]) => {
      for (const key of keys) {
        counters.delete(key);
        viewers.delete(key);
        sets.delete(key);
      }
      return keys.length;
    },
    srem: async (key: string, member: string) => (sets.get(key)?.delete(member) ? 1 : 0),
    /** Puts a finished day back exactly as the crash left it (commit done, keys alive). */
    seedDay(day: string, articleId: string, views: number, uniqueViewers: number) {
      counters.set(knowledgeViewKeys.counter(day, articleId), views);
      viewers.set(
        knowledgeViewKeys.viewers(day, articleId),
        new Set(Array.from({ length: uniqueViewers }, (_, index) => `viewer-${index}`)),
      );
      set(knowledgeViewKeys.dayArticles(day)).add(articleId);
      set(knowledgeViewKeys.pendingDays).add(day);
    },
    pendingDays: () => [...(sets.get(knowledgeViewKeys.pendingDays) ?? [])],
    hasCounter: (day: string, articleId: string) => counters.has(knowledgeViewKeys.counter(day, articleId)),
  };
  return client;
}

const day = '2026-11-18';
const dayDate = new Date(`${day}T00:00:00.000Z`);
const afterThatDay = new Date('2026-11-19T00:30:00.000Z');

function harness(options: { readonly rawLock?: boolean; readonly failUpsertWith?: string } = {}) {
  const prisma = createFakePrisma(options);
  const redis = createFakeRedis();
  prisma.articles.set('a1', { viewCount: 0, lastViewedAt: null });
  return { prisma, redis };
}

describe('knowledge article view counters (W7.89, BA-knowledge-base-16)', () => {
  it('does not count a day twice when the flush crashes after the commit', async () => {
    const { prisma, redis } = harness();
    redis.seedDay(day, 'a1', 3, 2);

    expect(
      await flushKnowledgeArticleViews({ prisma: prisma as never, redis: redis as never, now: afterThatDay }),
    ).toBe(1);
    expect(prisma.days.get(`a1:${dayDate.toISOString()}`)).toMatchObject({ views: 3, uniqueViewers: 2 });
    expect(prisma.articles.get('a1')?.viewCount).toBe(3);
    expect(redis.pendingDays()).toEqual([]);

    // The crash: the transaction committed, the Redis delete never happened.
    redis.seedDay(day, 'a1', 3, 2);
    expect(
      await flushKnowledgeArticleViews({ prisma: prisma as never, redis: redis as never, now: afterThatDay }),
    ).toBe(0);
    expect(prisma.days.get(`a1:${dayDate.toISOString()}`)).toMatchObject({ views: 3, uniqueViewers: 2 });
    expect(prisma.articles.get('a1')?.viewCount).toBe(3);
    // The retry still drains the keys, otherwise the day would be retried forever.
    expect(redis.pendingDays()).toEqual([]);
    expect(redis.hasCounter(day, 'a1')).toBe(false);
  });

  it('never lowers a day whose Redis keys expired and were rebuilt smaller', async () => {
    const { prisma, redis } = harness();
    redis.seedDay(day, 'a1', 9, 4);
    await flushKnowledgeArticleViews({ prisma: prisma as never, redis: redis as never, now: afterThatDay });

    redis.seedDay(day, 'a1', 2, 1);
    expect(
      await flushKnowledgeArticleViews({ prisma: prisma as never, redis: redis as never, now: afterThatDay }),
    ).toBe(0);
    expect(prisma.days.get(`a1:${dayDate.toISOString()}`)).toMatchObject({ views: 9, uniqueViewers: 4 });
    expect(prisma.articles.get('a1')?.viewCount).toBe(9);
  });

  it('clamps unique viewers to the day and moves the total by the delta only', async () => {
    const { prisma, redis } = harness();
    redis.seedDay(day, 'a1', 1, 5);

    expect(
      await flushKnowledgeArticleViews({ prisma: prisma as never, redis: redis as never, now: afterThatDay }),
    ).toBe(1);
    expect(prisma.days.get(`a1:${dayDate.toISOString()}`)).toMatchObject({ views: 1, uniqueViewers: 1 });
    expect(prisma.articles.get('a1')?.viewCount).toBe(1);
  });

  it('takes the per-day advisory lock before reading the day it is about to write', async () => {
    const { prisma, redis } = harness({ rawLock: true });
    redis.seedDay(day, 'a1', 3, 2);

    await flushKnowledgeArticleViews({ prisma: prisma as never, redis: redis as never, now: afterThatDay });

    const lock = prisma.calls.findIndex((call) => call.startsWith('raw:SELECT pg_advisory_xact_lock'));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(prisma.calls[lock]).toContain('hashtext');
    expect(prisma.calls.indexOf('findUnique')).toBeGreaterThan(lock);
    expect(prisma.calls.indexOf('upsert')).toBeGreaterThan(prisma.calls.indexOf('findUnique'));
  });

  it('drops the counters of an article deleted meanwhile and rethrows anything else', async () => {
    const deleted = harness({ failUpsertWith: 'P2003' });
    deleted.redis.seedDay(day, 'a1', 3, 2);
    await expect(
      flushKnowledgeArticleViews({
        prisma: deleted.prisma as never,
        redis: deleted.redis as never,
        now: afterThatDay,
      }),
    ).resolves.toBe(0);
    expect(deleted.redis.pendingDays()).toEqual([]);

    const broken = harness({ failUpsertWith: 'P2010' });
    broken.redis.seedDay(day, 'a1', 3, 2);
    await expect(
      flushKnowledgeArticleViews({
        prisma: broken.prisma as never,
        redis: broken.redis as never,
        now: afterThatDay,
      }),
    ).rejects.toThrow('simulated');
  });

  it('counts a Redis-less view without claiming a new viewer', async () => {
    const { prisma } = harness();
    await recordKnowledgeArticleView({
      prisma: prisma as never,
      redis: null,
      articleId: 'a1',
      userId: 'viewer-1',
      now: new Date('2026-11-18T10:00:00.000Z'),
    });
    await recordKnowledgeArticleView({
      prisma: prisma as never,
      redis: null,
      articleId: 'a1',
      userId: 'viewer-2',
      now: new Date('2026-11-18T10:05:00.000Z'),
    });

    // Two visits, one day row, zero claimed viewers: without Redis nobody can tell
    // whether viewer-2 had been here before, so the counter stays honest.
    expect(prisma.days.get(`a1:${dayDate.toISOString()}`)).toMatchObject({ views: 2, uniqueViewers: 0 });
    expect(prisma.articles.get('a1')?.viewCount).toBe(2);
  });
});
