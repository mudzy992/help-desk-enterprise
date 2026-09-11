import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { assertCanReadKnowledgeArticle } from './can-read-knowledge-article';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import {
  loadKnowledgeArticleScope,
  loadOwnerGroupMemberUserIds,
} from './load-knowledge-article-scope';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
} from './knowledge-base.types';

export async function getKnowledgeArticle(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  articleId: string,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeArticleRecord> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const article = await loadKnowledgeArticleRecord(prisma, articleId);
  const scope = await loadKnowledgeArticleScope(prisma, article);
  const ownerGroupMemberUserIds = await loadOwnerGroupMemberUserIds(
    prisma,
    article.ownerGroupId,
  );
  assertCanReadKnowledgeArticle({
    context: actor,
    article,
    scope,
    ownerGroupMemberUserIds,
    writePermissionKey: permissionKeys.knowledgeArticleWrite,
    reviewPermissionKey: permissionKeys.knowledgeArticleReview,
    publishPermissionKey: permissionKeys.knowledgeArticlePublish,
  });
  return article;
}
