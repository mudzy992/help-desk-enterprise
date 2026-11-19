import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toArticleRecord } from './load-knowledge-article';
import {
  keysetCursorOf,
  type KnowledgeArticleCursor,
} from './knowledge-article-cursor';
import type {
  KnowledgeArticleRecord,
  ListKnowledgeArticlesQuery,
} from './knowledge-base.types';

type ArticleRow = Parameters<typeof toArticleRecord>[0];

/**
 * W7.52 (BA-knowledge-base-04): one bounded read of the article table.
 *
 * The caller asks for `limit` rows after `after`; `hasMore` tells whether the
 * database still has rows beyond this window. Visibility is applied by the
 * caller on this bounded window, never on an unbounded result set.
 */
export type KnowledgeArticleScanWindow = {
  readonly limit: number;
  readonly after: KnowledgeArticleCursor | null;
};

export type KnowledgeArticleScanBatch = {
  /** Records of this window after the in-memory text safety net. */
  readonly records: readonly KnowledgeArticleRecord[];
  /** Rows the database returned for this window (before filtering). */
  readonly rawCount: number;
  /** True when the database reported rows beyond this window. */
  readonly hasMore: boolean;
  /** Position right after the last scanned row; `null` at the end. */
  readonly nextPosition: KnowledgeArticleCursor | null;
};

export function supportsFullTextSearch(prisma: PrismaService): boolean {
  return typeof prisma.$queryRawUnsafe === 'function';
}

export async function fetchKnowledgeArticlesForList(
  prisma: PrismaService,
  query: ListKnowledgeArticlesQuery,
  window: KnowledgeArticleScanWindow,
): Promise<KnowledgeArticleScanBatch> {
  const needle = query.q?.trim() ?? '';
  if (needle.length === 0 || !supportsFullTextSearch(prisma)) {
    return loadWithPrismaFindMany(prisma, query, needle, window);
  }
  return loadWithFullTextSearch(prisma, query, needle, window);
}

async function loadWithPrismaFindMany(
  prisma: PrismaService,
  query: ListKnowledgeArticlesQuery,
  needle: string,
  window: KnowledgeArticleScanWindow,
): Promise<KnowledgeArticleScanBatch> {
  // Keyset window: `(updatedAt desc, id asc)` resumes strictly after the last
  // row of the previous window, so no offset scan and no skipped/duplicated row.
  const after = window.after?.kind === 'keyset' ? window.after : null;
  const rows = (await prisma.knowledgeArticle.findMany({
    where: {
      ...buildScalarWhere(query),
      ...buildTextWhere(needle),
      ...(after === null
        ? {}
        : {
            OR: [
              { updatedAt: { lt: after.updatedAt } },
              { updatedAt: after.updatedAt, id: { gt: after.id } },
            ],
          }),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: window.limit + 1,
  })) as ArticleRow[];
  const hasMore = rows.length > window.limit;
  const windowRows = hasMore ? rows.slice(0, window.limit) : rows;
  const lastRow = windowRows.at(-1);
  return {
    records: applyTextSafetyNet(windowRows, needle),
    rawCount: windowRows.length,
    hasMore,
    nextPosition: lastRow === undefined ? null : keysetCursorOf(lastRow),
  };
}

async function loadWithFullTextSearch(
  prisma: PrismaService,
  query: ListKnowledgeArticlesQuery,
  needle: string,
  window: KnowledgeArticleScanWindow,
): Promise<KnowledgeArticleScanBatch> {
  // Rank ordering has no keyset, so the search path is offset-paged and the
  // offset is capped by `maximumSearchOffset` when the cursor is decoded.
  const offset = window.after?.kind === 'offset' ? window.after.offset : 0;
  const conditions = [`"searchVector" @@ plainto_tsquery('simple', $1)`];
  const parameters: unknown[] = [needle];
  let next = 2;
  if (query.serviceId !== undefined) {
    conditions.push(`"serviceId" = $${next}`);
    parameters.push(query.serviceId);
    next += 1;
  }
  if (query.status !== undefined) {
    conditions.push(`"status" = $${next}::"KnowledgeArticleStatus"`);
    parameters.push(query.status);
    next += 1;
  }
  if (query.organizationalUnitId !== undefined) {
    conditions.push(`"organizationalUnitId" = $${next}`);
    parameters.push(query.organizationalUnitId);
    next += 1;
  }
  const ranked = (await prisma.$queryRawUnsafe(
    `SELECT id
     FROM "KnowledgeArticle"
     WHERE ${conditions.join(' AND ')}
     ORDER BY ts_rank("searchVector", plainto_tsquery('simple', $1)) DESC,
       "updatedAt" DESC,
       id ASC
     LIMIT $${next} OFFSET $${next + 1}`,
    ...parameters,
    window.limit + 1,
    offset,
  )) as readonly { id: string }[];
  const hasMore = ranked.length > window.limit;
  const windowIds = (hasMore ? ranked.slice(0, window.limit) : ranked).map(
    (row) => row.id,
  );
  if (windowIds.length === 0) {
    return { records: [], rawCount: 0, hasMore: false, nextPosition: null };
  }
  const order = new Map(windowIds.map((id, index) => [id, index]));
  const records = (await prisma.knowledgeArticle.findMany({
    where: { id: { in: windowIds } },
  })) as ArticleRow[];
  return {
    records: records
      .map(toArticleRecord)
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)),
    rawCount: windowIds.length,
    hasMore,
    nextPosition: { kind: 'offset', offset: offset + windowIds.length },
  };
}

/** Kept from Val 3: clients that ignored the nested filter still get clean rows. */
function applyTextSafetyNet(
  rows: readonly ArticleRow[],
  needle: string,
): readonly KnowledgeArticleRecord[] {
  if (needle.length === 0) {
    return rows.map(toArticleRecord);
  }
  const lowered = needle.toLowerCase();
  return rows
    .filter(
      (record) =>
        record.title.toLowerCase().includes(lowered) ||
        record.body.toLowerCase().includes(lowered) ||
        record.slug.toLowerCase().includes(lowered),
    )
    .map(toArticleRecord);
}

function buildTextWhere(needle: string): Prisma.KnowledgeArticleWhereInput {
  if (needle.length === 0) {
    return {};
  }
  const contains = { contains: needle, mode: 'insensitive' as const };
  return { OR: [{ title: contains }, { body: contains }, { slug: contains }] };
}

function buildScalarWhere(query: ListKnowledgeArticlesQuery): {
  serviceId?: string;
  status?: ListKnowledgeArticlesQuery['status'];
  organizationalUnitId?: string;
} {
  return {
    ...(query.serviceId === undefined ? {} : { serviceId: query.serviceId }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.organizationalUnitId === undefined
      ? {}
      : { organizationalUnitId: query.organizationalUnitId }),
  };
}
