import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { fetchKnowledgeArticlesForList } from './fetch-knowledge-articles-for-list';
import { loadKnowledgeArticleVisibilities } from './load-knowledge-article-scope';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
  ListKnowledgeArticlesQuery,
} from './knowledge-base.types';

export async function listKnowledgeArticles(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  query: ListKnowledgeArticlesQuery,
  context: KnowledgeArticleMutationContext,
): Promise<readonly KnowledgeArticleRecord[]> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const records = await fetchKnowledgeArticlesForList(prisma, query);
  // Val 3 (M14/B5): one batched visibility check instead of three queries per row.
  const visible = await loadKnowledgeArticleVisibilities(prisma, actor, records);
  return records.filter((article) => visible.has(article.id));
}
