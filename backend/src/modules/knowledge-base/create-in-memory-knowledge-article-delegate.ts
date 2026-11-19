import { pickInMemoryFields } from '../routing/in-memory-routing-store';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export type InMemoryKnowledgeArticle = KnowledgeArticleRecord;

export type ArticleWhere = {
  readonly id?: string | { readonly gt: string };
  readonly updatedAt?: Date | { readonly lt?: Date; readonly gt?: Date };
  readonly OR?: readonly ArticleWhere[];
  readonly slug?: string;
  readonly serviceId?: string;
  readonly categoryId?: string | null;
  readonly archivedAt?: null;
  /** W7.57 (BA-search-03): the title search pushes `status: { not }` down. */
  readonly status?:
    | KnowledgeArticleRecord['status']
    | { readonly not: KnowledgeArticleRecord['status'] };
  /** W7.57 (BA-search-03): the title search pushes `title contains` down. */
  readonly title?: {
    readonly contains: string;
    readonly mode?: 'insensitive' | 'default';
  };
  readonly organizationalUnitId?: string | { in: readonly string[] };
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
      take,
    }: {
      where?: ArticleWhere;
      orderBy?: readonly Record<string, 'asc' | 'desc'>[];
      take?: number;
    } = {}) => {
      const sorted = sortArticles(matching(where), orderBy);
      // W7.52: bounded reads (`take: limit + 1`) must behave like Prisma's.
      return take === undefined ? sorted : sorted.slice(0, Math.max(take, 0));
    },
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
      data: Record<string, unknown>;
    }) => {
      const current = articles.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      const updated: InMemoryKnowledgeArticle = {
        ...current,
        ...applyIncrements(current, data),
        updatedAt: now(),
      };
      articles.set(updated.id, updated);
      return updated;
    },
    /**
     * W7.51 (BA-knowledge-base-03): the production code writes with a
     * compare-and-set (`id` + `status` + `updatedAt`), so the in-memory double
     * must honour the same predicates and advance the row timestamp on a hit.
     */
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; status?: InMemoryKnowledgeArticle['status']; updatedAt?: Date };
      data: Record<string, unknown>;
    }) => {
      const matched = matching(where);
      for (const article of matched) {
        const updated: InMemoryKnowledgeArticle = {
          ...article,
          ...applyIncrements(article, data),
          updatedAt: new Date(article.updatedAt.getTime() + 1),
        };
        articles.set(updated.id, updated);
      }
      return { count: matched.length };
    },
    findUniqueOrThrow: async ({
      where,
      select,
    }: {
      where: { id?: string; slug?: string };
      select?: Record<string, boolean>;
    }) => {
      const found = matching({ id: where.id, slug: where.slug })[0];
      if (found === undefined) {
        throw new Error('NOT_FOUND');
      }
      return pickInMemoryFields(found, select);
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = articles.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      articles.delete(where.id);
      return current;
    },
    count: async ({ where }: { where?: ArticleWhere } = {}) => matching(where).length,
  };
}

/** Supports Prisma's `{ increment: n }` for the K1 counters. */
function applyIncrements(
  current: InMemoryKnowledgeArticle,
  data: Record<string, unknown>,
): Partial<InMemoryKnowledgeArticle> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      'increment' in value
    ) {
      const base = (current as Record<string, unknown>)[key];
      next[key] =
        (typeof base === 'number' ? base : 0) +
        Number((value as { increment: number }).increment);
    } else {
      next[key] = value;
    }
  }
  return next as Partial<InMemoryKnowledgeArticle>;
}

function matchesArticle(
  article: InMemoryKnowledgeArticle,
  where?: ArticleWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.OR !== undefined && !where.OR.some((clause) => matchesArticle(article, clause))) {
    return false;
  }
  if (where.id !== undefined && !matchesId(article.id, where.id)) {
    return false;
  }
  if (where.slug !== undefined && article.slug !== where.slug) {
    return false;
  }
  if (
    where.updatedAt !== undefined &&
    !matchesUpdatedAt(article.updatedAt, where.updatedAt)
  ) {
    return false;
  }
  if (where.serviceId !== undefined && article.serviceId !== where.serviceId) {
    return false;
  }
  if ('categoryId' in where && article.categoryId !== where.categoryId) {
    return false;
  }
  if (where.archivedAt === null && article.archivedAt !== null) {
    return false;
  }
  if (
    !matchesOrganizationalUnit(article.organizationalUnitId, where.organizationalUnitId)
  ) {
    return false;
  }
  if (where.title !== undefined && !matchesTitle(article.title, where.title)) {
    return false;
  }
  return matchesStatus(article.status, where.status);
}

function matchesTitle(
  title: string,
  expected: { readonly contains: string; readonly mode?: 'insensitive' | 'default' },
): boolean {
  const needle = expected.contains;
  return expected.mode === 'insensitive'
    ? title.toLowerCase().includes(needle.toLowerCase())
    : title.includes(needle);
}

function matchesStatus(
  status: InMemoryKnowledgeArticle['status'],
  expected?:
    | InMemoryKnowledgeArticle['status']
    | { readonly not: InMemoryKnowledgeArticle['status'] },
): boolean {
  if (expected === undefined) {
    return true;
  }
  return typeof expected === 'string'
    ? status === expected
    : status !== expected.not;
}

function matchesId(id: string, expected: string | { readonly gt: string }): boolean {
  return typeof expected === 'string' ? id === expected : id > expected.gt;
}

function matchesUpdatedAt(
  value: Date,
  expected: Date | { readonly lt?: Date; readonly gt?: Date },
): boolean {
  if (expected instanceof Date) {
    return value.getTime() === expected.getTime();
  }
  if (expected.lt !== undefined && value.getTime() >= expected.lt.getTime()) {
    return false;
  }
  return expected.gt === undefined || value.getTime() > expected.gt.getTime();
}

function matchesOrganizationalUnit(
  value: string,
  expected?: string | { in: readonly string[] },
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (typeof expected === 'string') {
    return value === expected;
  }
  return expected.in.includes(value);
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
      const compared = compareFieldValues(
        (left as Record<string, unknown>)[field],
        (right as Record<string, unknown>)[field],
      );
      if (compared === 0) {
        continue;
      }
      return direction === 'desc' ? -compared : compared;
    }
    return 0;
  });
}

/** Dates compare by time, numbers numerically, everything else as strings. */
function compareFieldValues(left: unknown, right: unknown): number {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left ?? '').localeCompare(String(right ?? ''));
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
    categoryId: data.categoryId ?? null,
    isFaq: data.isFaq ?? false,
    faqOrder: data.faqOrder ?? null,
    ratingCount: data.ratingCount ?? 0,
    ratingSum: data.ratingSum ?? 0,
    viewCount: data.viewCount ?? 0,
    sourceTicketId: data.sourceTicketId ?? null,
    sourceMessageId: data.sourceMessageId ?? null,
  };
}
