/**
 * W7.81 (`BA-knowledge-base-07`): the article's `ratingCount`/`ratingSum` are a **derived** fact — a cached
 * aggregate of the `KnowledgeFeedback` rows. Two things can make a cache like that wrong, and neither was
 * handled before:
 *
 * 1. **Two writers.** The vote and the aggregate refresh were separate statements, and the refresh wrote
 *    absolute values (`SET ratingCount = 2`) computed from an aggregate it read a moment earlier. Two votes
 *    arriving together could therefore finish in the wrong order and leave the smaller snapshot on the row.
 * 2. **Rows that leave without a writer.** `KnowledgeFeedback.userId` is `onDelete: Cascade`, so deleting a
 *    user silently removes their votes — and nothing recomputed the counters of the articles they had rated.
 *
 * The repair has two halves:
 *
 * - `lockKnowledgeArticleRating` serialises every feedback mutation of one article (row lock), so a read of the
 *   vote set followed by a write of its totals cannot interleave with another vote on the same article;
 * - `reconcileKnowledgeArticleRatings` recomputes the totals **from the rows** — it is exact and idempotent, so
 *   running it after a vote or after a cascade heals any older drift instead of compounding it.
 *
 * Both work on a transaction client as well as the service itself: the vote runs them in one transaction, and
 * the user-deletion path runs them in the deletion transaction.
 */
export type KnowledgeFeedbackClient = {
  readonly $executeRawUnsafe?: (
    query: string,
    ...values: unknown[]
  ) => Promise<number>;
  readonly knowledgeFeedback: {
    aggregate(args: {
      where: { articleId: string; rating: { not: null } };
      _count: { rating: true };
      _sum: { rating: true };
    }): Promise<{
      _count: { rating: number };
      _sum: { rating: number | null };
    }>;
    findMany(args: {
      where: { userId: string; rating?: { not: null } };
      select: { articleId: true };
      distinct?: readonly ('articleId')[];
    }): Promise<readonly { articleId: string }[]>;
  };
  readonly knowledgeArticle: {
    update(args: {
      where: { id: string };
      data: { ratingCount: number; ratingSum: number };
    }): Promise<unknown>;
  };
};

export type KnowledgeArticleRatingTotals = {
  readonly ratingCount: number;
  readonly ratingSum: number;
};

/**
 * Takes the row lock of the article inside the surrounding transaction. Every writer that changes votes of the
 * same article passes through here first, while writers of other articles are unaffected.
 */
export async function lockKnowledgeArticleRating(
  client: KnowledgeFeedbackClient,
  articleId: string,
): Promise<void> {
  const raw = client.$executeRawUnsafe;
  if (typeof raw !== 'function') {
    // The in-memory client has no lock and no concurrency; the specs that need real races are integration ones.
    return;
  }
  await raw.call(
    client,
    'SELECT "id" FROM "KnowledgeArticle" WHERE "id" = $1 FOR UPDATE',
    articleId,
  );
}

/** Recomputes the totals of one article from its votes (exact, idempotent) and stores them. */
export async function reconcileKnowledgeArticleRating(
  client: KnowledgeFeedbackClient,
  articleId: string,
): Promise<KnowledgeArticleRatingTotals> {
  const aggregate = await client.knowledgeFeedback.aggregate({
    where: { articleId, rating: { not: null } },
    _count: { rating: true },
    _sum: { rating: true },
  });
  const totals: KnowledgeArticleRatingTotals = {
    ratingCount: aggregate._count.rating,
    ratingSum: aggregate._sum.rating ?? 0,
  };
  await writeRatingTotals(client, articleId, totals);
  return totals;
}

/**
 * Repair path for votes that disappear by cascade: recomputes the totals of every affected article. Duplicate
 * ids are collapsed, so a user who rated the same article twice (one-vote mode is a setting) costs one repair.
 */
export async function reconcileKnowledgeArticleRatings(
  client: KnowledgeFeedbackClient,
  articleIds: readonly string[],
): Promise<number> {
  const unique = [...new Set(articleIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  for (const articleId of unique) {
    await reconcileKnowledgeArticleRating(client, articleId);
  }
  return unique.length;
}

/**
 * The articles whose totals a user's removal can change. Only **rated** votes matter: a thumbs-only vote never
 * entered `ratingCount`/`ratingSum`, so its removal changes nothing.
 */
export async function collectRatedArticleIdsOfUser(
  client: KnowledgeFeedbackClient,
  userId: string,
): Promise<readonly string[]> {
  const rows = await client.knowledgeFeedback.findMany({
    where: { userId, rating: { not: null } },
    select: { articleId: true },
    distinct: ['articleId'],
  });
  return [...new Set(rows.map((row) => row.articleId))];
}

async function writeRatingTotals(
  client: KnowledgeFeedbackClient,
  articleId: string,
  totals: KnowledgeArticleRatingTotals,
): Promise<void> {
  const raw = client.$executeRawUnsafe;
  if (typeof raw === 'function') {
    // Raw on purpose: counters must not bump `updatedAt`, or a rating would look like an edit and reorder lists.
    await raw.call(
      client,
      'UPDATE "KnowledgeArticle" SET "ratingCount" = $1, "ratingSum" = $2 WHERE "id" = $3',
      totals.ratingCount,
      totals.ratingSum,
      articleId,
    );
    return;
  }
  await client.knowledgeArticle.update({
    where: { id: articleId },
    data: { ratingCount: totals.ratingCount, ratingSum: totals.ratingSum },
  });
}
