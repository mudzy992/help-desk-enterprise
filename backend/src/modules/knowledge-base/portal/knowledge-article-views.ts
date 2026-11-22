import type Redis from 'ioredis';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { updateKnowledgeArticleCounters } from './update-article-counters';

/**
 * Paket 2.9 (K1b, §2.3): article views without a row per view.
 *
 * - Redis (hot path): per UTC day and article a HyperLogLog of viewer ids
 *   (unique viewers, ~0.8 % error, 12 KB max) and a plain counter, plus a set
 *   of articles viewed that day and a set of pending days. Keys expire after
 *   8 days so an unflushed day can never grow without bound.
 * - Flush (every 15 min, inside the review-reminder job): each finished day is
 *   written to `KnowledgeArticleView` and added to `KnowledgeArticle.viewCount`
 *   in one transaction, then the keys are deleted. A crash between the commit
 *   and the delete may count that day twice for one article (documented,
 *   accepted: views are a guide, not billing).
 * - Redis down (or ACL without the HLL commands): the view goes straight to the
 *   database (one upsert + one update), so nothing is lost.
 */
export const knowledgeViewKeys = {
  pendingDays: 'kb:views:days',
  dayArticles: (day: string) => `kb:views:days:${day}`,
  counter: (day: string, articleId: string) => `kb:views:n:${day}:${articleId}`,
  viewers: (day: string, articleId: string) => `kb:views:u:${day}:${articleId}`,
} as const;

const keyTtlSeconds = 8 * 24 * 60 * 60;

export function utcDayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function recordKnowledgeArticleView(input: {
  readonly prisma: PrismaService;
  readonly redis: Redis | null;
  readonly articleId: string;
  readonly userId: string;
  readonly now: Date;
}): Promise<'redis' | 'database'> {
  const day = utcDayOf(input.now);
  if (input.redis !== null) {
    try {
      const result = await input.redis
        .multi()
        .pfadd(knowledgeViewKeys.viewers(day, input.articleId), input.userId)
        .incr(knowledgeViewKeys.counter(day, input.articleId))
        .sadd(knowledgeViewKeys.dayArticles(day), input.articleId)
        .sadd(knowledgeViewKeys.pendingDays, day)
        .expire(knowledgeViewKeys.viewers(day, input.articleId), keyTtlSeconds)
        .expire(knowledgeViewKeys.counter(day, input.articleId), keyTtlSeconds)
        .expire(knowledgeViewKeys.dayArticles(day), keyTtlSeconds)
        .exec();
      if (result !== null && result.every(([error]) => error === null)) {
        return 'redis';
      }
    } catch {
      // Fall through to the database path.
    }
  }
  await writeDayViews(input.prisma, input.articleId, day, 1, 1, input.now);
  return 'database';
}

/**
 * W7.86 (`BA-knowledge-base-13`): what is still waiting in Redis. The flush used to
 * report only how many articles it wrote, so an operator could not tell "nothing to
 * do" from "the sweep has not run for a week and the keys are about to expire".
 */
export type KnowledgeViewBacklog = Readonly<{
  /** Finished UTC days still pending; they are drained by the next flush. */
  pendingFinishedDays: number;
  /** The oldest such day, or `null` when there is nothing to flush. */
  oldestFinishedDay: string | null;
  /** How many days that oldest one is behind `now`'s UTC day; `null` when empty. */
  lagDays: number | null;
}>;

/** The flush predicate, in one place: a finished UTC day still in the pending set. */
export async function readPendingFinishedDays(redis: Redis, today: string): Promise<string[]> {
  return (await redis.smembers(knowledgeViewKeys.pendingDays))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today)
    .sort();
}

/**
 * W7.86: read-only answer to "how far behind is the counter flush". The keys expire
 * after eight days, so `lagDays` growing past one is the early warning that the
 * sweep (or its schedule) has been gone for a while — the oldest window still in
 * Redis is the only place where that fact is visible.
 */
export async function inspectKnowledgeViewBacklog(input: {
  readonly redis: Redis;
  readonly now: Date;
}): Promise<KnowledgeViewBacklog> {
  const today = utcDayOf(input.now);
  const days = await readPendingFinishedDays(input.redis, today);
  const oldest = days[0] ?? null;
  return {
    pendingFinishedDays: days.length,
    oldestFinishedDay: oldest,
    lagDays: oldest === null ? null : utcDayLagDays(oldest, today),
  };
}

function utcDayLagDays(day: string, today: string): number {
  const elapsed = Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${day}T00:00:00.000Z`);
  return Math.max(0, Math.round(elapsed / 86_400_000));
}

/** Flushes every pending day before `now`'s UTC day. Returns articles written. */
export async function flushKnowledgeArticleViews(input: {
  readonly prisma: PrismaService;
  readonly redis: Redis;
  readonly now: Date;
}): Promise<number> {
  const days = await readPendingFinishedDays(input.redis, utcDayOf(input.now));
  let written = 0;
  for (const day of days) {
    const articleIds = await input.redis.smembers(knowledgeViewKeys.dayArticles(day));
    for (const articleId of articleIds) {
      const counterKey = knowledgeViewKeys.counter(day, articleId);
      const viewersKey = knowledgeViewKeys.viewers(day, articleId);
      const views = Number((await input.redis.get(counterKey)) ?? 0);
      const unique = await input.redis.pfcount(viewersKey);
      if (views > 0) {
        try {
          await writeDayViews(input.prisma, articleId, day, views, unique, endOfDay(day));
          written += 1;
        } catch {
          // Article deleted meanwhile (FK): drop its counters.
        }
      }
      await input.redis.del(counterKey, viewersKey);
      await input.redis.srem(knowledgeViewKeys.dayArticles(day), articleId);
    }
    await input.redis.del(knowledgeViewKeys.dayArticles(day));
    await input.redis.srem(knowledgeViewKeys.pendingDays, day);
  }
  return written;
}

async function writeDayViews(
  prisma: PrismaService,
  articleId: string,
  day: string,
  views: number,
  uniqueViewers: number,
  viewedAt: Date,
): Promise<void> {
  const dayDate = new Date(`${day}T00:00:00.000Z`);
  await prisma.$transaction(async (transaction) => {
    await transaction.knowledgeArticleView.upsert({
      where: { articleId_day: { articleId, day: dayDate } },
      create: { articleId, day: dayDate, views, uniqueViewers },
      update: {
        views: { increment: views },
        uniqueViewers: { increment: uniqueViewers },
      },
    });
    await updateKnowledgeArticleCounters(transaction as PrismaService, articleId, {
      viewIncrement: views,
      viewedAt,
    });
  });
}

function endOfDay(day: string): Date {
  return new Date(`${day}T23:59:59.000Z`);
}
