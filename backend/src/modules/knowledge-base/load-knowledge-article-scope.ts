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
