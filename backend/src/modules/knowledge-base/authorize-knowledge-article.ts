import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { decideAuthorizationAccess } from '../authorization/evaluate-authorization-access';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export function canUseKnowledgePermission(input: {
  readonly context: AuthorizationContext;
  readonly permissionKey: string;
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
  readonly serviceId: string;
}): boolean {
  return decideAuthorizationAccess({
    context: input.context,
    requiredRoles: [],
    requiredPermissions: [input.permissionKey],
    organizationalUnitId: input.organizationalUnitId,
    organizationalUnitPath: input.organizationalUnitPath,
    serviceId: input.serviceId,
    requireOrganizationalUnitScope: true,
    requireServiceScope: true,
  }).allowed;
}

export function canHandleKnowledgeScope(input: {
  readonly context: AuthorizationContext;
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
  readonly serviceId: string;
  readonly requiredRoles?: readonly string[];
}): boolean {
  return decideAuthorizationAccess({
    context: input.context,
    requiredRoles: input.requiredRoles ?? [
      authorizationRoleKeys.agent,
      authorizationRoleKeys.admin,
    ],
    requiredPermissions: [],
    organizationalUnitId: input.organizationalUnitId,
    organizationalUnitPath: input.organizationalUnitPath,
    serviceId: input.serviceId,
    requireOrganizationalUnitScope: true,
    requireServiceScope: true,
  }).allowed;
}

export function isKnowledgeArticleOwner(
  article: KnowledgeArticleRecord,
  actorUserId: string,
  ownerGroupMemberUserIds: ReadonlySet<string>,
): boolean {
  if (article.ownerUserId === actorUserId) {
    return true;
  }
  return (
    article.ownerGroupId !== null && ownerGroupMemberUserIds.has(actorUserId)
  );
}

export function isKnowledgeArticleReviewer(
  article: KnowledgeArticleRecord,
  actorUserId: string,
): boolean {
  return article.reviewerUserId === actorUserId;
}
