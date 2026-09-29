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
  readonly categoryId?: string | null;
  readonly isFaq?: boolean;
  readonly faqOrder?: number | null;
  readonly ratingCount?: number;
  readonly ratingSum?: number;
  readonly viewCount?: number;
  readonly sourceTicketId?: string | null;
  readonly sourceMessageId?: string | null;
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
    categoryId: record.categoryId ?? null,
    isFaq: record.isFaq ?? false,
    faqOrder: record.faqOrder ?? null,
    ratingCount: record.ratingCount ?? 0,
    ratingSum: record.ratingSum ?? 0,
    viewCount: record.viewCount ?? 0,
    sourceTicketId: record.sourceTicketId ?? null,
    sourceMessageId: record.sourceMessageId ?? null,
  };
}
