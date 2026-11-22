import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { createBullMqRootConfiguration } from '../../../common/redis/create-bullmq-root-configuration';
import { loadRedisConfiguration } from '../../../common/redis/load-redis-configuration';
import {
  flushKnowledgeArticleViews,
  knowledgeViewKeys,
  recordKnowledgeArticleView,
} from './knowledge-article-views';

/**
 * W7.89 (`BA-knowledge-base-16`): the flush must be idempotent and the Redis-less path
 * must not invent viewers. The unit spec proves the arithmetic with doubles; this one
 * proves it against real PostgreSQL and real Redis, where the advisory lock, the
 * absolute upsert and the HLL count actually have to hold together:
 *
 * - a crash between the commit and the key delete (simulated by putting the finished
 *   day back into Redis) must not move the day row or the article total;
 * - two flushes racing on the same day must add that day exactly once;
 * - a visit counted while Redis was down stays a view and never becomes a viewer.
 *
 * Runs only in the CI integration job (database + Redis are set there); skipped elsewhere.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabaseAndRedis = url && process.env.REDIS_HOST?.trim() ? describe : describe.skip;

const day = '2026-11-18';
const dayDate = new Date(`${day}T00:00:00.000Z`);
const afterThatDay = new Date('2026-11-19T00:30:00.000Z');

describeIfDatabaseAndRedis('knowledge view flush idempotency (PostgreSQL + Redis acceptance, W7.89)', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient | undefined;
  let redis: IORedis;
  const suffix = `${process.pid}-${Date.now()}`;
  let organizationalUnitId = '';
  let serviceId = '';
  const articleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const root = createBullMqRootConfiguration(loadRedisConfiguration());
    redis = new IORedis({ ...root.connection, lazyConnect: true, maxRetriesPerRequest: null });
    redis.on('error', () => undefined);
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT view flush ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-view-flush-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-view-flush-${suffix}`,
      },
    });
    organizationalUnitId = unit.id;
    const category = await database().serviceCategory.create({
      data: { name: `IT view flush category ${suffix}`, slug: `it-view-flush-cat-${suffix}` },
    });
    serviceId = (
      await database().service.create({
        data: { name: `IT view flush service ${suffix}`, slug: `it-view-flush-svc-${suffix}`, categoryId: category.id },
      })
    ).id;
  });

  beforeEach(async () => {
    await redis.connect();
  });

  afterEach(async () => {
    await forgetDay();
    redis.disconnect();
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (articleIds.length > 0) {
      await db.knowledgeArticle.deleteMany({ where: { id: { in: articleIds } } });
    }
    if (organizationalUnitId !== '') await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    await db.$disconnect();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  async function createArticle(title: string): Promise<string> {
    const article = await database().knowledgeArticle.create({
      data: {
        slug: `it-view-flush-${suffix}-${randomUUID().slice(0, 8)}`,
        title,
        body: 'Uputstvo za brojanje pregleda.',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        serviceId,
        organizationalUnitId,
      },
      select: { id: true },
    });
    articleIds.push(article.id);
    return article.id;
  }

  /** Puts a finished day into Redis the way the hot path would have. */
  async function seedDay(articleId: string, views: number, viewers: number): Promise<void> {
    for (let index = 0; index < views; index += 1) {
      await redis.incr(knowledgeViewKeys.counter(day, articleId));
    }
    for (let index = 0; index < viewers; index += 1) {
      await redis.pfadd(knowledgeViewKeys.viewers(day, articleId), `viewer-${index}`);
    }
    await redis.sadd(knowledgeViewKeys.dayArticles(day), articleId);
    await redis.sadd(knowledgeViewKeys.pendingDays, day);
  }

  async function forgetDay(): Promise<void> {
    for (const articleId of articleIds) {
      await redis.del(
        knowledgeViewKeys.counter(day, articleId),
        knowledgeViewKeys.viewers(day, articleId),
      );
      await redis.srem(knowledgeViewKeys.dayArticles(day), articleId);
    }
    await redis.srem(knowledgeViewKeys.pendingDays, day);
  }

  async function dayRowOf(articleId: string): Promise<{ views: number; uniqueViewers: number } | null> {
    const row = await database().knowledgeArticleView.findUnique({
      where: { articleId_day: { articleId, day: dayDate } },
      select: { views: true, uniqueViewers: true },
    });
    return row === null ? null : { views: row.views, uniqueViewers: row.uniqueViewers };
  }

  async function totalOf(articleId: string): Promise<number> {
    const row = await database().knowledgeArticle.findUniqueOrThrow({
      where: { id: articleId },
      select: { viewCount: true },
    });
    return row.viewCount;
  }

  it('writes a finished day once and treats a crash-retry as a no-op', async () => {
    const articleId = await createArticle('Kako se prijaviti na VPN');
    await seedDay(articleId, 5, 3);

    expect(
      await flushKnowledgeArticleViews({ prisma: database() as never, redis, now: afterThatDay }),
    ).toBe(1);
    expect(await dayRowOf(articleId)).toEqual({ views: 5, uniqueViewers: 3 });
    expect(await totalOf(articleId)).toBe(5);

    // The crash: the transaction committed, the process died before deleting the keys.
    await seedDay(articleId, 5, 3);
    expect(
      await flushKnowledgeArticleViews({ prisma: database() as never, redis, now: afterThatDay }),
    ).toBe(0);
    expect(await dayRowOf(articleId)).toEqual({ views: 5, uniqueViewers: 3 });
    expect(await totalOf(articleId)).toBe(5);
    // The retry still drains the day, so it cannot be retried forever.
    expect(await redis.smembers(knowledgeViewKeys.pendingDays)).not.toContain(day);
  });

  it('counts a day once when two flushes race on it', async () => {
    const articleId = await createArticle('Reset lozinke');
    await seedDay(articleId, 7, 4);

    const flushes = await Promise.all([
      flushKnowledgeArticleViews({ prisma: database() as never, redis, now: afterThatDay }),
      flushKnowledgeArticleViews({ prisma: database() as never, redis, now: afterThatDay }),
    ]);

    // The advisory lock serializes the pair (article, day): whoever runs second sees the
    // committed day, adds a zero delta and writes nothing.
    expect(flushes.reduce((sum, written) => sum + written, 0)).toBe(1);
    expect(await dayRowOf(articleId)).toEqual({ views: 7, uniqueViewers: 4 });
    expect(await totalOf(articleId)).toBe(7);
  });

  it('counts a Redis-less visit as a view, never as a new viewer', async () => {
    const articleId = await createArticle('Štampač ne prima posao');
    const visit = (minute: number) =>
      recordKnowledgeArticleView({
        prisma: database() as never,
        redis: null,
        articleId,
        userId: `viewer-${minute}`,
        now: new Date(`${day}T10:${String(minute).padStart(2, '0')}:00.000Z`),
      });

    await expect(visit(0)).resolves.toBe('database');
    await expect(visit(1)).resolves.toBe('database');
    expect(await dayRowOf(articleId)).toEqual({ views: 2, uniqueViewers: 0 });
    expect(await totalOf(articleId)).toBe(2);

    // Redis comes back before the day is finished and the flush meets the fallback row:
    // the day becomes the larger of the two counts, the viewers come from the HLL only.
    await seedDay(articleId, 5, 2);
    expect(
      await flushKnowledgeArticleViews({ prisma: database() as never, redis, now: afterThatDay }),
    ).toBe(1);
    expect(await dayRowOf(articleId)).toEqual({ views: 5, uniqueViewers: 2 });
    expect(await totalOf(articleId)).toBe(5);
  });
});
