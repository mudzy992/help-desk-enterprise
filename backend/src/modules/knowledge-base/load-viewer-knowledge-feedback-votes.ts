import { PrismaService } from '../../common/prisma/prisma.service';

export type ViewerKnowledgeVote = {
  readonly isHelpful: boolean;
  /** Paket 2.9 (K1): 1-5, null for a legacy thumbs vote. */
  readonly rating: number | null;
};

export async function loadViewerKnowledgeVotes(
  prisma: PrismaService,
  userId: string,
  articleIds: readonly string[],
): Promise<ReadonlyMap<string, ViewerKnowledgeVote>> {
  if (articleIds.length === 0) {
    return new Map();
  }
  const votes = await prisma.knowledgeFeedback.findMany({
    where: { userId, articleId: { in: [...articleIds] } },
    select: { articleId: true, isHelpful: true, rating: true },
  });
  return new Map(
    votes.map((vote) => [
      vote.articleId,
      { isHelpful: vote.isHelpful, rating: vote.rating ?? null },
    ]),
  );
}

export async function loadViewerKnowledgeFeedbackVotes(
  prisma: PrismaService,
  userId: string,
  articleIds: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  const votes = await loadViewerKnowledgeVotes(prisma, userId, articleIds);
  return new Map([...votes].map(([id, vote]) => [id, vote.isHelpful]));
}
