import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export type InMemoryKnowledgeArticle = KnowledgeArticleRecord;

type ArticleWhere = {
  readonly id?: string;
  readonly slug?: string;
  readonly serviceId?: string;
  readonly status?: KnowledgeArticleRecord['status'];
};

export function createInMemoryKnowledgeArticleDelegate(
  articles: Map<string, InMemoryKnowledgeArticle>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: ArticleWhere) =>
    [...articles.values()].filter((article) => matchesArticle(article, where));

  return {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id?: string; slug?: string };
      select?: Record<string, boolean>;
    }) =>
      pickInMemoryFields(
        matching({ id: where.id, slug: where.slug })[0],
        select,
      ),
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: ArticleWhere;
      orderBy?: readonly Record<string, 'asc' | 'desc'>[];
    } = {}) => sortArticles(matching(where), orderBy),
    create: async ({ data }: { data: Partial<InMemoryKnowledgeArticle> }) => {
      const created = createArticleRecord(data, nextId(), now());
      articles.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<InMemoryKnowledgeArticle>;
    }) => {
      const current = articles.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      const updated: InMemoryKnowledgeArticle = {
        ...current,
        ...data,
        updatedAt: now(),
      };
      articles.set(updated.id, updated);
      return updated;
    },
  };
}

function matchesArticle(
  article: InMemoryKnowledgeArticle,
  where?: ArticleWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.id !== undefined && article.id !== where.id) {
    return false;
  }
  if (where.slug !== undefined && article.slug !== where.slug) {
    return false;
  }
  if (where.serviceId !== undefined && article.serviceId !== where.serviceId) {
    return false;
  }
  return where.status === undefined || article.status === where.status;
}

function sortArticles(
  records: InMemoryKnowledgeArticle[],
  orderBy?: readonly Record<string, 'asc' | 'desc'>[],
): InMemoryKnowledgeArticle[] {
  if (orderBy === undefined) {
    return records;
  }
  return [...records].sort((left, right) => {
    for (const order of orderBy) {
      const [field, direction] = Object.entries(order)[0] ?? [];
      if (field === undefined || direction === undefined) {
        continue;
      }
      const leftValue = String(
        (left as Record<string, unknown>)[field] ?? '',
      );
      const rightValue = String(
        (right as Record<string, unknown>)[field] ?? '',
      );
      if (leftValue === rightValue) {
        continue;
      }
      const compared = leftValue.localeCompare(rightValue);
      return direction === 'desc' ? -compared : compared;
    }
    return 0;
  });
}

function createArticleRecord(
  data: Partial<InMemoryKnowledgeArticle>,
  id: string,
  timestamp: Date,
): InMemoryKnowledgeArticle {
  return {
    id,
    slug: data.slug ?? id,
    title: data.title ?? '',
    body: data.body ?? '',
    status: data.status ?? 'DRAFT',
    classification: data.classification ?? 'INTERNAL',
    isStale: data.isStale ?? false,
    reviewDueAt: data.reviewDueAt ?? null,
    publishedAt: data.publishedAt ?? null,
    lastReviewedAt: data.lastReviewedAt ?? null,
    archivedAt: data.archivedAt ?? null,
    ownerUserId: data.ownerUserId ?? null,
    ownerGroupId: data.ownerGroupId ?? null,
    reviewerUserId: data.reviewerUserId ?? null,
    serviceId: data.serviceId ?? '',
    organizationalUnitId: data.organizationalUnitId ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
