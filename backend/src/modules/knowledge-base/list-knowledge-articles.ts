import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { isKnowledgeArticleVisibleTo } from './load-knowledge-article-scope';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { toArticleRecord } from './load-knowledge-article';
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
  const records = await prisma.knowledgeArticle.findMany({
    where: {
      ...(query.serviceId === undefined ? {} : { serviceId: query.serviceId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.organizationalUnitId === undefined
        ? {}
        : { organizationalUnitId: query.organizationalUnitId }),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  const visible: KnowledgeArticleRecord[] = [];
  for (const record of records) {
    const article = toArticleRecord(record);
    if (!matchesKnowledgeListSearch(article, query.q)) {
      continue;
    }
    if (await isKnowledgeArticleVisibleTo(prisma, actor, article)) {
      visible.push(article);
    }
  }
  return visible;
}

function matchesKnowledgeListSearch(
  article: { readonly title: string; readonly body: string },
  query: string | undefined,
): boolean {
  const needle = query?.trim().toLowerCase() ?? '';
  if (needle.length === 0) {
    return true;
  }
  return (
    article.title.toLowerCase().includes(needle) ||
    article.body.toLowerCase().includes(needle)
  );
}
