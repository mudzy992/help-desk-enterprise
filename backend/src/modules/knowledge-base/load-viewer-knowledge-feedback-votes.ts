import { PrismaService } from '../../common/prisma/prisma.service';

export async function loadViewerKnowledgeFeedbackVotes(
  prisma: PrismaService,
  userId: string,
  articleIds: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  if (articleIds.length === 0) {
    return new Map();
  }
  const votes = await prisma.knowledgeFeedback.findMany({
    where: { userId, articleId: { in: [...articleIds] } },
    select: { articleId: true, isHelpful: true },
  });
  return new Map(votes.map((vote) => [vote.articleId, vote.isHelpful]));
}
