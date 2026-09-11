import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import {
  canUseKnowledgePermission,
  isKnowledgeArticleOwner,
  isKnowledgeArticleReviewer,
} from './authorize-knowledge-article';
import type { KnowledgeArticleAccessScope } from './can-read-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export function assertCanWriteKnowledgeArticle(input: {
  readonly context: AuthorizationContext;
  readonly article: KnowledgeArticleRecord;
  readonly scope: KnowledgeArticleAccessScope;
  readonly ownerGroupMemberUserIds: ReadonlySet<string>;
}): void {
  if (input.article.status === 'ARCHIVED') {
    throw new KnowledgeBaseError('ARTICLE_ARCHIVED');
  }
  if (input.context.isSuperAdmin) {
    return;
  }
  if (
    canUseKnowledgePermission({
      context: input.context,
      permissionKey: permissionKeys.knowledgeArticleWrite,
      ...input.scope,
    })
  ) {
    return;
  }
  if (
    isKnowledgeArticleOwner(
      input.article,
      input.context.subjectId,
      input.ownerGroupMemberUserIds,
    )
  ) {
    return;
  }
  throw new KnowledgeBaseError('FORBIDDEN');
}

export function assertCanReviewKnowledgeArticle(input: {
  readonly context: AuthorizationContext;
  readonly article: KnowledgeArticleRecord;
  readonly scope: KnowledgeArticleAccessScope;
}): void {
  if (input.context.isSuperAdmin) {
    return;
  }
  if (isKnowledgeArticleReviewer(input.article, input.context.subjectId)) {
    return;
  }
  if (
    canUseKnowledgePermission({
      context: input.context,
      permissionKey: permissionKeys.knowledgeArticleReview,
      ...input.scope,
    })
  ) {
    return;
  }
  throw new KnowledgeBaseError('FORBIDDEN');
}

export function assertCanPublishKnowledgeArticle(input: {
  readonly context: AuthorizationContext;
  readonly scope: KnowledgeArticleAccessScope;
}): void {
  if (input.context.isSuperAdmin) {
    return;
  }
  if (
    canUseKnowledgePermission({
      context: input.context,
      permissionKey: permissionKeys.knowledgeArticlePublish,
      ...input.scope,
    })
  ) {
    return;
  }
  throw new KnowledgeBaseError('FORBIDDEN');
}

export function assertCanCreateKnowledgeArticle(input: {
  readonly context: AuthorizationContext;
  readonly scope: KnowledgeArticleAccessScope;
}): void {
  if (input.context.isSuperAdmin) {
    return;
  }
  if (
    canUseKnowledgePermission({
      context: input.context,
      permissionKey: permissionKeys.knowledgeArticleWrite,
      ...input.scope,
    })
  ) {
    return;
  }
  throw new KnowledgeBaseError('FORBIDDEN');
}
