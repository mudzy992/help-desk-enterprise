import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { isKnowledgeArticleVisibleTo } from './load-knowledge-article-scope';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { toArticleRecord } from './load-knowledge-article';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
} from './knowledge-base.types';

export type KnowledgeArticleTitleMatch = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
};

type ArticleRow = Parameters<typeof toArticleRecord>[0];

/**
 * Title search behind `GET /search?types=article` (plan §1.2).
 *
 * The candidate read is bounded (`take`) and, like the article list, every
 * candidate still has to pass `isKnowledgeArticleVisibleTo`, so a hit is never
 * wider than the list the caller could open. Candidates are read a few times
 * over the requested limit, because the visibility filter may drop some.
 */
export async function searchKnowledgeArticleTitles(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly context: KnowledgeArticleMutationContext;
  readonly query: string;
  readonly limit: number;
  readonly candidateMultiplier: number;
}): Promise<readonly KnowledgeArticleTitleMatch[]> {
  const actor = await loadKnowledgeActorContext(
    input.authorizationContextLoader,
    input.context,
  );
  // The whole row is read on purpose: `isKnowledgeArticleVisibleTo` reads
  // classification, service, unit and owner scope, so a slim projection would
  // decide visibility on missing data. The read stays bounded by `take`.
  const candidates = (await input.prisma.knowledgeArticle.findMany({
    where: {
      title: { contains: input.query, mode: 'insensitive' },
      status: { not: 'ARCHIVED' },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: Math.max(input.limit * input.candidateMultiplier, input.limit),
  })) as ArticleRow[];
  const visible: KnowledgeArticleTitleMatch[] = [];
  for (const candidate of candidates) {
    if (visible.length >= input.limit) {
      break;
    }
    const record = toArticleRecord(candidate);
    if (await isKnowledgeArticleVisibleTo(input.prisma, actor, record)) {
      visible.push({ id: record.id, slug: record.slug, title: record.title });
    }
  }
  return visible;
}

export type { KnowledgeArticleRecord };
