import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import { loadKnowledgeArticleRecord } from './load-knowledge-article';
import { isKnowledgeArticleVisibleTo } from './load-knowledge-article-scope';
import { KnowledgeBaseError } from './knowledge-base.error';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
} from './knowledge-base.types';

export async function getKnowledgeArticle(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  articleId: string,
  context: KnowledgeArticleMutationContext,
): Promise<KnowledgeArticleRecord> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const article = await loadKnowledgeArticleRecord(prisma, articleId);
  // W7.60 (BA-search-06): the by-id read decides with the same loader the
  // search, list and portal surfaces use, so an article a caller cannot see in
  // `/search` cannot be fetched by guessing its id either — both answers come
  // from one call of `canReadKnowledgeArticle`.
  if (!(await isKnowledgeArticleVisibleTo(prisma, actor, article))) {
    throw new KnowledgeBaseError('FORBIDDEN');
  }
  return article;
}
