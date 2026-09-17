import { PrismaService } from '../../common/prisma/prisma.service';
import {
  changeLogActions,
  recordKnowledgeArticleChange,
} from './record-knowledge-article-change';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeLifecycleInput,
} from './knowledge-base.types';

export async function deleteKnowledgeArticle(
  prisma: PrismaService,
  articleId: string,
  input: KnowledgeLifecycleInput,
  context: KnowledgeArticleMutationContext,
): Promise<void> {
  const current = await loadKnowledgeArticleRecord(prisma, articleId);
  await prisma.$transaction(async (transaction) => {
    await recordKnowledgeArticleChange(transaction as PrismaService, {
      action: changeLogActions.delete,
      reason: input.reason,
      before: current,
      after: current,
      actorUserId: context.actorUserId,
    });
    await transaction.knowledgeArticle.delete({ where: { id: current.id } });
  });
}
