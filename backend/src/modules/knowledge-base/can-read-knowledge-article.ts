import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { KnowledgeArticleVisibilityRecord } from './knowledge-base.types';
import {
  canHandleKnowledgeScope,
  canUseKnowledgePermission,
  isKnowledgeArticleOwner,
  isKnowledgeArticleReviewer,
  isKnowledgeDelegationInScope,
  type KnowledgeArticleScope,
} from './authorize-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';

export type KnowledgeArticleAccessScope = KnowledgeArticleScope;

export function canReadKnowledgeArticle(input: {
  readonly context: AuthorizationContext;
  /**
   * W7.58 (BA-search-04): only the visibility columns are required. A caller
   * that must not read the article text (search) can pass its projection.
   */
  readonly article: KnowledgeArticleVisibilityRecord;
  readonly scope: KnowledgeArticleAccessScope;
  readonly ownerGroupMemberUserIds: ReadonlySet<string>;
  readonly writePermissionKey: string;
  readonly reviewPermissionKey: string;
  readonly publishPermissionKey: string;
  /**
   * W7.79 (`BA-knowledge-base-05`): INTERNAL is the default classification, so the audience has to be a stated
   * policy instead of a side effect. `internalCompanyWide` is that policy — the installation's explicit choice.
   */
  readonly internalCompanyWide: boolean;
  /**
   * The reader's home unit path, used only in the scoped policy: an employee reads the internal articles of the
   * unit they belong to (and its subtree), without needing a knowledge permission. `null` (no home unit) grants
   * nothing here — the reader is then treated like any other outsider.
   */
  readonly readerHomeOrganizationalUnitPath: string | null;
}): boolean {
  if (input.context.isSuperAdmin) {
    return true;
  }
  if (
    isKnowledgeArticleOwner({
      article: input.article,
      context: input.context,
      ownerGroupMemberUserIds: input.ownerGroupMemberUserIds,
      scope: input.scope,
    }) ||
    isKnowledgeArticleReviewer({
      article: input.article,
      context: input.context,
      scope: input.scope,
    })
  ) {
    return true;
  }
  if (input.article.status !== 'PUBLISHED') {
    return canManageUnpublishedArticle(input);
  }
  if (input.article.classification === 'INTERNAL') {
    return canReadInternalArticle(input);
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

/**
 * W7.79 (`BA-knowledge-base-05`): an INTERNAL article is readable by everybody **only** when the installation
 * says so. The scoped policy keeps it inside the article's own boundary, read from two sides:
 *
 * - **staff** — an assignment whose OU path and service cover the article (`isKnowledgeDelegationInScope`), i.e. the
 *   agents and admins who work that unit and that service;
 * - **employees** — the reader's home unit path covers the article's unit path (the unit subtree), so the portal of
 *   a unit keeps working without granting permissions.
 *
 * Both are needed: dropping the first would hide an internal article from the scoped agent who must act on it, and
 * dropping the second would turn every end-user portal into an empty page.
 */
function canReadInternalArticle(
  input: Parameters<typeof canReadKnowledgeArticle>[0],
): boolean {
  if (input.internalCompanyWide) {
    return true;
  }
  if (isKnowledgeDelegationInScope({ context: input.context, scope: input.scope })) {
    return true;
  }
  return doesOrganizationalUnitScopeCover({
    assignedPath: input.readerHomeOrganizationalUnitPath,
    requestedPath: input.scope.organizationalUnitPath,
  });
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
