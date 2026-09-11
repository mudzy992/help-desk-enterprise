import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { assertCanReadKnowledgeArticle } from './can-read-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeBaseConfiguration,
  KnowledgeFeedbackInput,
} from './knowledge-base.types';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import {
  loadKnowledgeArticleScope,
  loadOwnerGroupMemberUserIds,
} from './load-knowledge-article-scope';

export type KnowledgeFeedbackResponse = {
  readonly articleId: string;
  readonly userId: string;
  readonly isHelpful: boolean;
  readonly updatedAt: string;
};

export async function submitKnowledgeFeedback(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  configuration: KnowledgeBaseConfiguration,
  articleId: string,
  input: KnowledgeFeedbackInput,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeFeedbackResponse> {
  if (!configuration.feedbackEnabled) {
    throw new KnowledgeBaseError('FEEDBACK_DISABLED');
  }
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
  const persisted = configuration.oneVotePerUserPerArticle
    ? await prisma.knowledgeFeedback.upsert({
        where: {
          articleId_userId: { articleId, userId: context.actorUserId },
        },
        create: {
          articleId,
          userId: context.actorUserId,
          isHelpful: input.isHelpful,
        },
        update: { isHelpful: input.isHelpful },
      })
    : await prisma.knowledgeFeedback.create({
        data: {
          articleId,
          userId: context.actorUserId,
          isHelpful: input.isHelpful,
        },
      });
  return {
    articleId: persisted.articleId,
    userId: persisted.userId,
    isHelpful: persisted.isHelpful,
    updatedAt: persisted.updatedAt.toISOString(),
  };
}
