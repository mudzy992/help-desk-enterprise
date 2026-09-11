export type RankableKnowledgeArticle = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly publishedAt: Date | null;
};

export type KnowledgeFeedbackTally = {
  readonly helpfulCount: number;
  readonly notHelpfulCount: number;
};

export type RankedKnowledgeArticle<T extends RankableKnowledgeArticle> = T & {
  readonly score: number;
};

export function rankKnowledgeArticles<T extends RankableKnowledgeArticle>(input: {
  readonly articles: readonly T[];
  readonly query: string;
  readonly feedbackByArticleId: ReadonlyMap<string, KnowledgeFeedbackTally>;
  readonly useFeedbackWeight: boolean;
}): readonly RankedKnowledgeArticle<T>[] {
  const queryTokens = tokenize(input.query);
  const ranked = input.articles.map((article) => {
    const textScore = scoreText(article, queryTokens);
    const tally = input.feedbackByArticleId.get(article.id) ?? {
      helpfulCount: 0,
      notHelpfulCount: 0,
    };
    const feedbackNet = tally.helpfulCount - tally.notHelpfulCount;
    const score =
      textScore * 100 + (input.useFeedbackWeight ? feedbackNet * 10 : 0);
    return { ...article, score };
  });
  return [...ranked].sort((left, right) => compareRanked(left, right));
}

export function tokenize(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function scoreText(
  article: RankableKnowledgeArticle,
  queryTokens: readonly string[],
): number {
  if (queryTokens.length === 0) {
    return 0;
  }
  const titleTokens = new Set(tokenize(article.title));
  const bodyTokens = new Set(tokenize(article.body));
  let score = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      score += 2;
    } else if (bodyTokens.has(token)) {
      score += 1;
    }
  }
  return score;
}

function compareRanked(
  left: RankedKnowledgeArticle<RankableKnowledgeArticle>,
  right: RankedKnowledgeArticle<RankableKnowledgeArticle>,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  const leftPublished = left.publishedAt?.getTime() ?? 0;
  const rightPublished = right.publishedAt?.getTime() ?? 0;
  if (rightPublished !== leftPublished) {
    return rightPublished - leftPublished;
  }
  return left.id.localeCompare(right.id);
}
