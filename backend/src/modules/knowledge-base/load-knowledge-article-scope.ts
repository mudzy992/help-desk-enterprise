import { PrismaService } from '../../common/prisma/prisma.service';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { KnowledgeArticleAccessScope } from './can-read-knowledge-article';
import { canReadKnowledgeArticle } from './can-read-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export async function loadKnowledgeArticleScope(
  prisma: PrismaService,
  article: Pick<KnowledgeArticleRecord, 'organizationalUnitId' | 'serviceId'>,
): Promise<KnowledgeArticleAccessScope> {
  const organizationalUnitPath = await loadOrganizationalUnitPath(
    prisma,
    article.organizationalUnitId,
  );
  if (organizationalUnitPath === null) {
    throw new KnowledgeBaseError('ORGANIZATIONAL_UNIT_NOT_FOUND');
  }
  const service = await prisma.service.findUnique({
    where: { id: article.serviceId },
    select: { id: true },
  });
  if (service === null) {
    throw new KnowledgeBaseError('SERVICE_NOT_FOUND');
  }
  return {
    organizationalUnitId: article.organizationalUnitId,
    organizationalUnitPath,
    serviceId: article.serviceId,
  };
}

export async function loadOwnerGroupMemberUserIds(
  prisma: PrismaService,
  ownerGroupId: string | null,
): Promise<ReadonlySet<string>> {
  if (ownerGroupId === null) {
    return new Set();
  }
  const members = await prisma.groupMember.findMany({
    where: { groupId: ownerGroupId },
    select: { userId: true },
  });
  return new Set(members.map((member) => member.userId));
}

/**
 * Val 3 (M14/B5): the list and the ticket interception asked
 * `isKnowledgeArticleVisibleTo` per article, and every call loaded the OU path,
 * the service and the owner group's members — three queries per row. This
 * variant resolves the same facts for the whole page in a handful of queries
 * (the OU path goes through the cached catalog loader, services and group
 * members are read in one batch each) and returns the ids the actor may read.
 */
export async function loadKnowledgeArticleVisibilities(
  prisma: PrismaService,
  context: AuthorizationContext,
  articles: readonly KnowledgeArticleRecord[],
): Promise<ReadonlySet<string>> {
  if (articles.length === 0) {
    return new Set();
  }
  if (context.isSuperAdmin) {
    return new Set(articles.map((article) => article.id));
  }
  const organizationalUnitPaths = new Map<string, string>();
  for (const organizationalUnitId of new Set(
    articles.map((article) => article.organizationalUnitId),
  )) {
    const path = await loadOrganizationalUnitPath(prisma, organizationalUnitId);
    if (path === null) {
      throw new KnowledgeBaseError('ORGANIZATIONAL_UNIT_NOT_FOUND');
    }
    organizationalUnitPaths.set(organizationalUnitId, path);
  }
  const serviceIds = [...new Set(articles.map((article) => article.serviceId))];
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true },
  });
  const existingServiceIds = new Set(services.map((service) => service.id));
  if (serviceIds.some((serviceId) => !existingServiceIds.has(serviceId))) {
    throw new KnowledgeBaseError('SERVICE_NOT_FOUND');
  }
  const membersByGroup = await loadOwnerGroupMembersByGroup(
    prisma,
    articles.map((article) => article.ownerGroupId),
  );
  const visible = new Set<string>();
  for (const article of articles) {
    const organizationalUnitPath = organizationalUnitPaths.get(article.organizationalUnitId);
    if (organizationalUnitPath === undefined) {
      throw new KnowledgeBaseError('ORGANIZATIONAL_UNIT_NOT_FOUND');
    }
    if (
      canReadKnowledgeArticle({
        context,
        article,
        scope: {
          organizationalUnitId: article.organizationalUnitId,
          organizationalUnitPath,
          serviceId: article.serviceId,
        },
        ownerGroupMemberUserIds:
          article.ownerGroupId === null
            ? emptyUserIdSet
            : membersByGroup.get(article.ownerGroupId) ?? emptyUserIdSet,
        writePermissionKey: permissionKeys.knowledgeArticleWrite,
        reviewPermissionKey: permissionKeys.knowledgeArticleReview,
        publishPermissionKey: permissionKeys.knowledgeArticlePublish,
      })
    ) {
      visible.add(article.id);
    }
  }
  return visible;
}

async function loadOwnerGroupMembersByGroup(
  prisma: PrismaService,
  ownerGroupIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const groupIds = [...new Set(ownerGroupIds.filter((id): id is string => id !== null))];
  if (groupIds.length === 0) {
    return new Map();
  }
  const members = await prisma.groupMember.findMany({
    where: { groupId: { in: groupIds } },
    select: { groupId: true, userId: true },
  });
  const byGroup = new Map<string, Set<string>>();
  for (const member of members) {
    const bucket = byGroup.get(member.groupId) ?? new Set<string>();
    bucket.add(member.userId);
    byGroup.set(member.groupId, bucket);
  }
  return byGroup;
}

const emptyUserIdSet: ReadonlySet<string> = new Set();

export async function isKnowledgeArticleVisibleTo(
  prisma: PrismaService,
  context: AuthorizationContext,
  article: KnowledgeArticleRecord,
): Promise<boolean> {
  const scope = await loadKnowledgeArticleScope(prisma, article);
  const ownerGroupMemberUserIds = await loadOwnerGroupMemberUserIds(
    prisma,
    article.ownerGroupId,
  );
  return canReadKnowledgeArticle({
    context,
    article,
    scope,
    ownerGroupMemberUserIds,
    writePermissionKey: permissionKeys.knowledgeArticleWrite,
    reviewPermissionKey: permissionKeys.knowledgeArticleReview,
    publishPermissionKey: permissionKeys.knowledgeArticlePublish,
  });
}
