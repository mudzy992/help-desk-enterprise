export type InMemoryKnowledgeFeedback = {
  readonly id: string;
  readonly articleId: string;
  readonly userId: string;
  readonly isHelpful: boolean;
  readonly rating?: number | null;
  readonly comment?: string | null;
  readonly commentResolvedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type FeedbackData = {
  articleId: string;
  userId: string;
  isHelpful: boolean;
  rating?: number | null;
  comment?: string | null;
};

/**
 * Exported because it is now recursive (`OR?: FeedbackWhere[]`), and TypeScript's declaration emit cannot
 * inline a self-referential type: the harness factories would fail with TS4058 ("cannot be named").
 */
export type FeedbackWhere = {
  readonly articleId?: string | { in: readonly string[] };
  readonly userId?: string;
  /** W7.53 (BA-reports-01): report packs pin votes to the window. */
  readonly createdAt?: { readonly gte?: Date; readonly lte?: Date; readonly lt?: Date };
  /** W7.81 (BA-knowledge-base-07): only rated votes move the article rating totals. */
  readonly rating?: { readonly not?: null };
  /** W7.90 (`BA-knowledge-base-17`): the curator comment feed filters on a present comment. */
  readonly comment?: { readonly not?: null };
  /** W7.90: unresolved only. */
  readonly commentResolvedAt?: null;
  /** W7.90: the keyset of the comment page — `(createdAt desc, id desc)`. */
  readonly OR?: readonly FeedbackWhere[];
  readonly id?: { readonly lt?: string };
};

export function createInMemoryKnowledgeFeedbackDelegate(
  feedbacks: Map<string, InMemoryKnowledgeFeedback>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: FeedbackWhere) =>
    [...feedbacks.values()].filter((item) => matchesFeedback(item, where));

  return {
    findUnique: async ({
      where,
    }: {
      where: { articleId_userId: { articleId: string; userId: string } };
    }) =>
      matching({
        articleId: where.articleId_userId.articleId,
        userId: where.articleId_userId.userId,
      })[0] ?? null,
    aggregate: async ({ where }: { where: { articleId: string } }) => {
      const rated = matching({ articleId: where.articleId }).filter(
        (item) => typeof item.rating === 'number',
      );
      return {
        _count: { rating: rated.length },
        _sum: {
          rating:
            rated.length === 0
              ? null
              : rated.reduce((sum, item) => sum + (item.rating ?? 0), 0),
        },
      };
    },
    // W7.90 (`BA-knowledge-base-17`): a page filter that the double silently ignored would let broken
    // pagination pass, so `orderBy`/`take` are applied here the way Prisma applies them.
    findMany: async ({
      where,
      select,
      orderBy,
      take,
    }: {
      where?: FeedbackWhere;
      select?: Record<string, boolean>;
      orderBy?: readonly Record<string, 'asc' | 'desc'>[];
      take?: number;
    } = {}) => {
      const rows = orderFeedback(matching(where), orderBy);
      return (take === undefined ? rows : rows.slice(0, take)).map((item) =>
        pickFeedback(item, select),
      );
    },
    create: async ({
      data,
    }: {
      data: FeedbackData;
    }) => {
      const duplicate = matching({
        articleId: data.articleId,
        userId: data.userId,
      })[0];
      if (duplicate !== undefined) {
        throw new Error('FEEDBACK_DUPLICATE');
      }
      const created: InMemoryKnowledgeFeedback = {
        id: nextId(),
        ...data,
        createdAt: now(),
        updatedAt: now(),
      };
      feedbacks.set(created.id, created);
      return created;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { articleId_userId: { articleId: string; userId: string } };
      create: FeedbackData;
      update: Partial<Omit<FeedbackData, 'articleId' | 'userId'>>;
    }) => {
      const existing = matching({
        articleId: where.articleId_userId.articleId,
        userId: where.articleId_userId.userId,
      })[0];
      if (existing === undefined) {
        const created: InMemoryKnowledgeFeedback = {
          id: nextId(),
          ...create,
          createdAt: now(),
          updatedAt: now(),
        };
        feedbacks.set(created.id, created);
        return created;
      }
      const next: InMemoryKnowledgeFeedback = {
        ...existing,
        ...update,
        updatedAt: now(),
      };
      feedbacks.set(existing.id, next);
      return next;
    },
  };
}

function matchesFeedback(
  item: InMemoryKnowledgeFeedback,
  where?: FeedbackWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.userId !== undefined && item.userId !== where.userId) {
    return false;
  }
  if (where.createdAt !== undefined) {
    const { gte, lte } = where.createdAt;
    if (gte !== undefined && item.createdAt.getTime() < gte.getTime()) {
      return false;
    }
    if (lte !== undefined && item.createdAt.getTime() > lte.getTime()) {
      return false;
    }
    if (where.createdAt.lt !== undefined && !(item.createdAt.getTime() < where.createdAt.lt.getTime())) {
      return false;
    }
  }
  if (where.rating?.not === null && typeof item.rating !== 'number') {
    // `rating: { not: null }` — thumbs-only votes are not part of the rating totals.
    return false;
  }
  if (where.comment?.not === null && (item.comment ?? null) === null) {
    return false;
  }
  if (where.commentResolvedAt === null && (item.commentResolvedAt ?? null) !== null) {
    return false;
  }
  if (where.id?.lt !== undefined && !(item.id < where.id.lt)) {
    return false;
  }
  if (where.OR !== undefined && !where.OR.some((branch) => matchesFeedback(item, branch))) {
    return false;
  }
  if (where.articleId === undefined) {
    return true;
  }
  if (typeof where.articleId === 'string') {
    return item.articleId === where.articleId;
  }
  return where.articleId.in.includes(item.articleId);
}

function pickFeedback(
  item: InMemoryKnowledgeFeedback,
  select?: Record<string, boolean>,
): InMemoryKnowledgeFeedback | Record<string, unknown> {
  if (select === undefined) {
    return item;
  }
  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      picked[key] = item[key as keyof InMemoryKnowledgeFeedback];
    }
  }
  return picked;
}

/** W7.90: the multi-column order the comment page relies on. */
function orderFeedback(
  rows: readonly InMemoryKnowledgeFeedback[],
  orderBy?: readonly Record<string, 'asc' | 'desc'>[],
): InMemoryKnowledgeFeedback[] {
  if (orderBy === undefined) {
    return [...rows];
  }
  return [...rows].sort((left, right) => {
    for (const clause of orderBy) {
      for (const [key, direction] of Object.entries(clause)) {
        const first = left[key as keyof InMemoryKnowledgeFeedback];
        const second = right[key as keyof InMemoryKnowledgeFeedback];
        const comparable = (value: unknown): string | number =>
          value instanceof Date ? value.getTime() : (value as string | number);
        const a = comparable(first);
        const b = comparable(second);
        if (a === b) continue;
        return (a < b ? -1 : 1) * (direction === 'asc' ? 1 : -1);
      }
    }
    return 0;
  });
}
