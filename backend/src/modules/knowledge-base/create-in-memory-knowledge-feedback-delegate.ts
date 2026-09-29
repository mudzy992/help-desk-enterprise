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

type FeedbackData = {
  articleId: string;
  userId: string;
  isHelpful: boolean;
  rating?: number | null;
  comment?: string | null;
};

type FeedbackWhere = {
  readonly articleId?: string | { in: readonly string[] };
  readonly userId?: string;
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
    findMany: async ({
      where,
      select,
    }: {
      where?: FeedbackWhere;
      select?: Record<string, boolean>;
    } = {}) => matching(where).map((item) => pickFeedback(item, select)),
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
