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
 *   written to `KnowledgeArticleView` in one transaction and the keys are then
 *   deleted. W7.89 (`BA-knowledge-base-16`): the day row is an **absolute** value,
 *   not an increment, so a crash between the commit and the delete costs nothing —
 *   the retry writes the same numbers, sees a zero delta and leaves
 *   `KnowledgeArticle.viewCount` alone. The pair (article, day) is serialized with
 *   an advisory transaction lock, so two flushes cannot both add the same delta.
 * - Redis down (or ACL without the HLL commands): the view goes straight to the
 *   database (one absolute daily row that is incremented by one, plus the article
 *   total), so nothing is lost. That path cannot deduplicate viewers, so it counts
 *   views only and leaves `uniqueViewers` alone; `uniqueViewers` is therefore a
 *   lower bound observed on the days Redis was serving (W7.89).
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
  await recordDatabaseView(input.prisma, input.articleId, day, input.now);
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
          // W7.89: `true` means the day or the article total actually moved; a
          // retry after a crash writes the same absolute numbers and reports false.
          if (await writeFlushedDay(input.prisma, articleId, day, views, unique)) {
            written += 1;
          }
        } catch (error) {
          // The article was deleted while its counters were in flight (FK) - drop
          // them. Anything else is a real failure and must not look like one.
          if (!isUnknownArticleError(error)) {
            throw error;
          }
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

type RawQueryCapable = {
  $queryRawUnsafe?: (query: string, ...values: unknown[]) => Promise<unknown>;
};

type DaySnapshot = { readonly views: number; readonly uniqueViewers: number };

/**
 * W7.89 (`BA-knowledge-base-16`): the flush writes the day as an absolute value, so it
 * has to know what was there before to know how much the article total moves. The
 * advisory transaction lock serializes the pair (article, day) - it also covers the
 * first write, when there is no row to lock yet - and is released with the transaction.
 * The in-memory test client has no raw SQL, so it takes the unlocked path.
 */
async function lockDay(prisma: PrismaService, articleId: string, dayDate: Date): Promise<DaySnapshot | null> {
  const raw = (prisma as unknown as RawQueryCapable).$queryRawUnsafe;
  if (typeof raw === 'function') {
    await raw.call(
      prisma,
      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
      `${articleId}:${dayDate.toISOString()}`,
    );
  }
  const row = await prisma.knowledgeArticleView.findUnique({
    where: { articleId_day: { articleId, day: dayDate } },
    select: { views: true, uniqueViewers: true },
  });
  return row === null ? null : { views: row.views, uniqueViewers: row.uniqueViewers };
}

/**
 * W7.89: one finished day, written as an absolute value. Returns whether anything
 * moved, so a crash-retry (same counters still in Redis) is visibly a no-op:
 * the day row keeps `max(previous, redis)` and the total moves only by the delta.
 * A day whose keys expired and were rebuilt smaller can therefore never shrink
 * either number. `uniqueViewers` is clamped to the day's views.
 */
async function writeFlushedDay(
  prisma: PrismaService,
  articleId: string,
  day: string,
  views: number,
  uniqueViewers: number,
): Promise<boolean> {
  const dayDate = new Date(`${day}T00:00:00.000Z`);
  return prisma.$transaction(async (transaction) => {
    const previous = await lockDay(transaction as PrismaService, articleId, dayDate);
    const nextViews = Math.max(previous?.views ?? 0, views);
    const nextUniqueViewers = Math.min(Math.max(previous?.uniqueViewers ?? 0, uniqueViewers), nextViews);
    await transaction.knowledgeArticleView.upsert({
      where: { articleId_day: { articleId, day: dayDate } },
      create: { articleId, day: dayDate, views: nextViews, uniqueViewers: nextUniqueViewers },
      update: { views: nextViews, uniqueViewers: nextUniqueViewers },
    });
    const added = nextViews - (previous?.views ?? 0);
    if (added <= 0) {
      return false;
    }
    await updateKnowledgeArticleCounters(transaction as PrismaService, articleId, {
      viewIncrement: added,
      viewedAt: endOfDay(day),
    });
    return true;
  });
}

/**
 * W7.89: the Redis-less path. It cannot deduplicate a viewer, so it counts the view
 * and nothing else - `uniqueViewers` stays whatever the Redis days established
 * instead of growing to the number of visits (the old behaviour inflated it to
 * "every visit is a new person" during an incident).
 */
async function recordDatabaseView(
  prisma: PrismaService,
  articleId: string,
  day: string,
  now: Date,
): Promise<void> {
  const dayDate = new Date(`${day}T00:00:00.000Z`);
  await prisma.$transaction(async (transaction) => {
    await transaction.knowledgeArticleView.upsert({
      where: { articleId_day: { articleId, day: dayDate } },
      create: { articleId, day: dayDate, views: 1, uniqueViewers: 0 },
      update: { views: { increment: 1 } },
    });
    await updateKnowledgeArticleCounters(transaction as PrismaService, articleId, {
      viewIncrement: 1,
      viewedAt: now,
    });
  });
}

function endOfDay(day: string): Date {
  return new Date(`${day}T23:59:59.000Z`);
}

/** `P2003` (FK) / `P2025` (record not found): the article is gone, its counters are moot. */
function isUnknownArticleError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2003' || code === 'P2025';
}
