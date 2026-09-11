import type { KnowledgeArticleRecord, KnowledgeArticleResponse } from './knowledge-base.types';

export function toKnowledgeArticleResponse(
  record: KnowledgeArticleRecord,
): KnowledgeArticleResponse {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    body: record.body,
    status: record.status,
    classification: record.classification,
    isStale: record.isStale,
    reviewDueAt: toIso(record.reviewDueAt),
    publishedAt: toIso(record.publishedAt),
    lastReviewedAt: toIso(record.lastReviewedAt),
    archivedAt: toIso(record.archivedAt),
    ownerUserId: record.ownerUserId,
    ownerGroupId: record.ownerGroupId,
    reviewerUserId: record.reviewerUserId,
    serviceId: record.serviceId,
    organizationalUnitId: record.organizationalUnitId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toKnowledgeArticleSnapshot(record: KnowledgeArticleRecord) {
  return {
    slug: record.slug,
    title: record.title,
    status: record.status,
    classification: record.classification,
    isStale: record.isStale,
    ownerUserId: record.ownerUserId,
    ownerGroupId: record.ownerGroupId,
    reviewerUserId: record.reviewerUserId,
    serviceId: record.serviceId,
    organizationalUnitId: record.organizationalUnitId,
    reviewDueAt: toIso(record.reviewDueAt),
    publishedAt: toIso(record.publishedAt),
    lastReviewedAt: toIso(record.lastReviewedAt),
    archivedAt: toIso(record.archivedAt),
  };
}
