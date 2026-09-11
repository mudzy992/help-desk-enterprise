import { authorizationRoleKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { KnowledgeArticleRecord } from './knowledge-base.types';
import {
  canHandleKnowledgeScope,
  canUseKnowledgePermission,
  isKnowledgeArticleOwner,
  isKnowledgeArticleReviewer,
} from './authorize-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';

export type KnowledgeArticleAccessScope = {
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
  readonly serviceId: string;
};

export function canReadKnowledgeArticle(input: {
  readonly context: AuthorizationContext;
  readonly article: KnowledgeArticleRecord;
  readonly scope: KnowledgeArticleAccessScope;
  readonly ownerGroupMemberUserIds: ReadonlySet<string>;
  readonly writePermissionKey: string;
  readonly reviewPermissionKey: string;
  readonly publishPermissionKey: string;
}): boolean {
  if (input.context.isSuperAdmin) {
    return true;
  }
  if (
    isKnowledgeArticleOwner(
      input.article,
      input.context.subjectId,
      input.ownerGroupMemberUserIds,
    ) ||
    isKnowledgeArticleReviewer(input.article, input.context.subjectId)
  ) {
    return true;
  }
  if (input.article.status !== 'PUBLISHED') {
    return canManageUnpublishedArticle(input);
  }
  if (input.article.classification === 'INTERNAL') {
    return true;
  }
  if (input.article.classification === 'CONFIDENTIAL') {
    return canHandleKnowledgeScope({
      context: input.context,
      ...input.scope,
    });
  }
  return canHandleKnowledgeScope({
    context: input.context,
    requiredRoles: [authorizationRoleKeys.admin],
    ...input.scope,
  });
}

export function assertCanReadKnowledgeArticle(
  input: Parameters<typeof canReadKnowledgeArticle>[0],
): void {
  if (!canReadKnowledgeArticle(input)) {
    throw new KnowledgeBaseError('FORBIDDEN');
  }
}

function canManageUnpublishedArticle(
  input: Parameters<typeof canReadKnowledgeArticle>[0],
): boolean {
  const permissionKeys = [
    input.writePermissionKey,
    input.reviewPermissionKey,
    input.publishPermissionKey,
  ];
  return permissionKeys.some((permissionKey) =>
    canUseKnowledgePermission({
      context: input.context,
      permissionKey,
      ...input.scope,
    }),
  );
}
