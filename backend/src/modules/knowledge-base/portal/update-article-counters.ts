import { PrismaService } from '../../../common/prisma/prisma.service';

type RawCapable = {
  $executeRawUnsafe?: (query: string, ...values: unknown[]) => Promise<number>;
};

/**
 * Paket 2.9 (K1b): counters (views, rating totals) must not bump the
 * article's `updatedAt` (Prisma's @updatedAt would), otherwise every view
 * would reorder the list and look like an edit. Raw SQL in production; the
 * in-memory test client (no raw support) falls back to a normal update.
 */
export async function updateKnowledgeArticleCounters(
  prisma: PrismaService,
  articleId: string,
  counters: {
    readonly viewIncrement?: number;
    readonly viewedAt?: Date;
    readonly ratingCount?: number;
    readonly ratingSum?: number;
  },
): Promise<void> {
  const raw = (prisma as unknown as RawCapable).$executeRawUnsafe;
  if (typeof raw === 'function') {
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (fragment: (index: number) => string, value: unknown) => {
      values.push(value);
      sets.push(fragment(values.length));
    };
    if (counters.viewIncrement !== undefined) {
      push((i) => `"viewCount" = "viewCount" + $${i}`, counters.viewIncrement);
    }
    if (counters.viewedAt !== undefined) {
      push(
        (i) => `"lastViewedAt" = GREATEST(COALESCE("lastViewedAt", $${i}::timestamp), $${i}::timestamp)`,
        counters.viewedAt,
      );
    }
    if (counters.ratingCount !== undefined) {
      push((i) => `"ratingCount" = $${i}`, counters.ratingCount);
    }
    if (counters.ratingSum !== undefined) {
      push((i) => `"ratingSum" = $${i}`, counters.ratingSum);
    }
    if (sets.length === 0) {
      return;
    }
    values.push(articleId);
    await raw.call(
      prisma,
      `UPDATE "KnowledgeArticle" SET ${sets.join(', ')} WHERE "id" = $${values.length}`,
      ...values,
    );
    return;
  }
  await prisma.knowledgeArticle.update({
    where: { id: articleId },
    data: {
      ...(counters.viewIncrement !== undefined
        ? { viewCount: { increment: counters.viewIncrement } }
        : {}),
      ...(counters.viewedAt !== undefined ? { lastViewedAt: counters.viewedAt } : {}),
      ...(counters.ratingCount !== undefined ? { ratingCount: counters.ratingCount } : {}),
      ...(counters.ratingSum !== undefined ? { ratingSum: counters.ratingSum } : {}),
    },
  });
}
