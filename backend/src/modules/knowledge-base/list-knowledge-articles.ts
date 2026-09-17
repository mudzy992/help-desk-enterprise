import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { fetchKnowledgeArticlesForList } from './fetch-knowledge-articles-for-list';
import { isKnowledgeArticleVisibleTo } from './load-knowledge-article-scope';
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
  const visible: KnowledgeArticleRecord[] = [];
  for (const article of records) {
    if (await isKnowledgeArticleVisibleTo(prisma, actor, article)) {
      visible.push(article);
    }
  }
  return visible;
}
