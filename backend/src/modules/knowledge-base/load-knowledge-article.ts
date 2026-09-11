import { PrismaService } from '../../common/prisma/prisma.service';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export async function loadKnowledgeArticleRecord(
  prisma: PrismaService,
  articleId: string,
): Promise<KnowledgeArticleRecord> {
  const record = await prisma.knowledgeArticle.findUnique({
    where: { id: articleId },
  });
  if (record === null) {
    throw new KnowledgeBaseError('NOT_FOUND');
  }
  return toArticleRecord(record);
}

export function toArticleRecord(record: {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly status: KnowledgeArticleRecord['status'];
  readonly classification: KnowledgeArticleRecord['classification'];
  readonly isStale: boolean;
  readonly reviewDueAt: Date | null;
  readonly publishedAt: Date | null;
  readonly lastReviewedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly ownerUserId: string | null;
  readonly ownerGroupId: string | null;
  readonly reviewerUserId: string | null;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): KnowledgeArticleRecord {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    body: record.body,
    status: record.status,
    classification: record.classification,
    isStale: record.isStale,
    reviewDueAt: record.reviewDueAt,
    publishedAt: record.publishedAt,
    lastReviewedAt: record.lastReviewedAt,
    archivedAt: record.archivedAt,
    ownerUserId: record.ownerUserId,
    ownerGroupId: record.ownerGroupId,
    reviewerUserId: record.reviewerUserId,
    serviceId: record.serviceId,
    organizationalUnitId: record.organizationalUnitId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
