import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertKnowledgeOrganizationalUnitExists,
  assertKnowledgeServiceExists,
} from './assert-knowledge-references';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeArticleMutationContext } from './knowledge-base.types';

export type KnowledgeInterceptResolveInput = {
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly articleId?: string;
};

export type KnowledgeInterceptResolveResponse = {
  readonly id: string;
};

export async function resolveKnowledgeIntercept(
  prisma: PrismaService,
  input: KnowledgeInterceptResolveInput,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeInterceptResolveResponse> {
  const serviceId = await assertKnowledgeServiceExists(prisma, input.serviceId);
  const organizationalUnitId = await assertKnowledgeOrganizationalUnitExists(
    prisma,
    input.organizationalUnitId,
  );
  let primaryArticleId: string | null = null;
  if (input.articleId !== undefined && input.articleId.trim().length > 0) {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: input.articleId.trim() },
      select: { id: true },
    });
    if (article === null) {
      throw new KnowledgeBaseError('NOT_FOUND');
    }
    primaryArticleId = article.id;
  }
  const created = await prisma.knowledgeInterceptResolution.create({
    data: {
      userId: context.actorUserId,
      serviceId,
      organizationalUnitId,
      primaryArticleId,
    },
    select: { id: true },
  });
  return { id: created.id };
}
