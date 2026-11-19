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

export type KnowledgeArticleScope = {
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
  readonly serviceId: string;
};

/**
 * W7.49 (BA-knowledge-base-01): ownership is a delegation, and a delegation
 * holds only while the delegate still has an assignment that covers the
 * article's own OU and service. A global `USER` assignment covers no OU (that
 * is deliberate in `doesOrganizationalUnitScopeCover`), so adding somebody to
 * an owner group no longer hands over every article of that group, and moving
 * or re-scoping a delegate ends the delegation on the next request.
 */
export function isKnowledgeDelegationInScope(input: {
  readonly context: AuthorizationContext;
  readonly scope: KnowledgeArticleScope;
}): boolean {
  return decideAuthorizationAccess({
    context: input.context,
    requiredRoles: [],
    requiredPermissions: [],
    organizationalUnitId: input.scope.organizationalUnitId,
    organizationalUnitPath: input.scope.organizationalUnitPath,
    serviceId: input.scope.serviceId,
    requireOrganizationalUnitScope: true,
    requireServiceScope: true,
  }).allowed;
}

export function isKnowledgeArticleOwner(input: {
  readonly article: KnowledgeArticleRecord;
  readonly context: AuthorizationContext;
  readonly ownerGroupMemberUserIds: ReadonlySet<string>;
  readonly scope: KnowledgeArticleScope;
}): boolean {
  if (!isKnowledgeDelegationInScope(input)) {
    return false;
  }
  if (input.article.ownerUserId === input.context.subjectId) {
    return true;
  }
  return (
    input.article.ownerGroupId !== null &&
    input.ownerGroupMemberUserIds.has(input.context.subjectId)
  );
}

/**
 * W7.50 (BA-knowledge-base-02): the reviewer assignment is a delegation with
 * the same lifetime rule as ownership — it holds only while the reviewer still
 * has an assignment covering the article's OU and service, so a re-scope, an
 * OU move or a `reviewerUserId` reset ends it on the next request.
 */
export function isKnowledgeArticleReviewer(input: {
  readonly article: KnowledgeArticleRecord;
  readonly context: AuthorizationContext;
  readonly scope: KnowledgeArticleScope;
}): boolean {
  if (input.article.reviewerUserId !== input.context.subjectId) {
    return false;
  }
  return isKnowledgeDelegationInScope(input);
}
