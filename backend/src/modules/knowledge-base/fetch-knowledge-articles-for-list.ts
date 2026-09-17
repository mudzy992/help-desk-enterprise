import { PrismaService } from '../../common/prisma/prisma.service';
import { toArticleRecord } from './load-knowledge-article';
import type {
  KnowledgeArticleRecord,
  ListKnowledgeArticlesQuery,
} from './knowledge-base.types';

type ArticleRow = Parameters<typeof toArticleRecord>[0];

export async function fetchKnowledgeArticlesForList(
  prisma: PrismaService,
  query: ListKnowledgeArticlesQuery,
): Promise<readonly KnowledgeArticleRecord[]> {
  const needle = query.q?.trim() ?? '';
  if (needle.length === 0 || !supportsFullTextSearch(prisma)) {
    return loadWithPrismaFindMany(prisma, query, needle);
  }
  return loadWithFullTextSearch(prisma, query, needle);
}

function supportsFullTextSearch(prisma: PrismaService): boolean {
  return typeof prisma.$queryRawUnsafe === 'function';
}

async function loadWithPrismaFindMany(
  prisma: PrismaService,
  query: ListKnowledgeArticlesQuery,
  needle: string,
): Promise<readonly KnowledgeArticleRecord[]> {
  const records = (await prisma.knowledgeArticle.findMany({
    where: buildScalarWhere(query),
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  })) as ArticleRow[];
  if (needle.length === 0) {
    return records.map(toArticleRecord);
  }
  const lowered = needle.toLowerCase();
  return records
    .filter(
      (record) =>
        record.title.toLowerCase().includes(lowered) ||
        record.body.toLowerCase().includes(lowered) ||
        record.slug.toLowerCase().includes(lowered),
    )
    .map(toArticleRecord);
}

async function loadWithFullTextSearch(
  prisma: PrismaService,
  query: ListKnowledgeArticlesQuery,
  needle: string,
): Promise<readonly KnowledgeArticleRecord[]> {
  const conditions = [
    `"searchVector" @@ plainto_tsquery('simple', $1)`,
  ];
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
  }
  const ranked = (await prisma.$queryRawUnsafe(
    `SELECT id
     FROM "KnowledgeArticle"
     WHERE ${conditions.join(' AND ')}
     ORDER BY ts_rank("searchVector", plainto_tsquery('simple', $1)) DESC,
       "updatedAt" DESC,
       id ASC`,
    ...parameters,
  )) as readonly { id: string }[];
  if (ranked.length === 0) {
    return [];
  }
  const order = new Map(ranked.map((row, index) => [row.id, index]));
  const records = (await prisma.knowledgeArticle.findMany({
    where: { id: { in: ranked.map((row) => row.id) } },
  })) as ArticleRow[];
  return records
    .map(toArticleRecord)
    .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
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
