import type { DataClassification, KnowledgeArticleStatus } from '../../generated/prisma/enums';
import { knowledgeBaseTestIds } from './knowledge-base-test-ids';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export function publishedArticleSeed(
  overrides: Partial<KnowledgeArticleRecord> = {},
): KnowledgeArticleRecord {
  const timestamp = new Date('2026-09-11T12:00:00.000Z');
  return {
    id: overrides.id ?? 'article-vpn',
    slug: overrides.slug ?? 'reset-vpn-password',
    title: overrides.title ?? 'Reset VPN password',
    body:
      overrides.body ??
      'Use the self-service portal to reset your VPN client password.',
    status: (overrides.status ?? 'PUBLISHED') as KnowledgeArticleStatus,
    classification:
      (overrides.classification ?? 'INTERNAL') as DataClassification,
    isStale: overrides.isStale ?? false,
    reviewDueAt: overrides.reviewDueAt ?? null,
    publishedAt: overrides.publishedAt ?? timestamp,
    lastReviewedAt: overrides.lastReviewedAt ?? timestamp,
    archivedAt: overrides.archivedAt ?? null,
    ownerUserId: overrides.ownerUserId ?? knowledgeBaseTestIds.agentIt,
    ownerGroupId: overrides.ownerGroupId ?? null,
    reviewerUserId: overrides.reviewerUserId ?? knowledgeBaseTestIds.adminIt,
    serviceId: overrides.serviceId ?? knowledgeBaseTestIds.serviceVpn,
    organizationalUnitId:
      overrides.organizationalUnitId ?? knowledgeBaseTestIds.ouIt,
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
  };
}
