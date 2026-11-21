import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import {
  fetchKnowledgeArticlesForList,
  supportsFullTextSearch,
} from './fetch-knowledge-articles-for-list';
import { loadKnowledgeArticleVisibilities } from './load-knowledge-article-scope';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import {
  decodeKnowledgeArticleCursor,
  encodeKnowledgeArticleCursor,
  keysetCursorOf,
  resolvePageSize,
  type KnowledgeArticleCursor,
} from './knowledge-article-cursor';
import { knowledgeBaseConstants } from './knowledge-base.constants';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
  KnowledgeBaseConfiguration,
  ListKnowledgeArticlesQuery,
} from './knowledge-base.types';

/**
 * W7.52 (BA-knowledge-base-04): a bounded page of readable articles.
 *
 * Before this package `GET /articles` and the portal loaded every matching row,
 * ran the batch visibility check and returned the survivors with no upper
 * bound. Now a request reads at most
 * `listScanBatchSize x maximumListScanBatches` rows (default 50 x 4 = 200),
 * returns at most `limit` of them and says `hasMore`, so the caller pages with
 * the `nextCursor` it receives.
 */
export type KnowledgeArticlePage = {
  readonly items: readonly KnowledgeArticleRecord[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type ListKnowledgeArticlesOptions = {
  /**
   * W7.79 (`BA-knowledge-base-05`): the caller's parsed configuration carries the INTERNAL audience policy; a page
   * cannot be built without deciding who may read its INTERNAL rows.
   */
  readonly configuration: KnowledgeBaseConfiguration;
  readonly limit?: number;
  readonly cursor?: string;
  /** Portal pages are smaller than console pages. */
  readonly defaultPageSize?: number;
  /** The portal home scans a fixed cap instead of serving a page. */
  readonly maximumPageSize?: number;
  /**
   * Applied inside the scan so that filtered-out rows do not shorten a page
   * (the console's `staleOnly` filter used to run after paging).
   */
  readonly accept?: (article: KnowledgeArticleRecord) => boolean;
};

export async function listKnowledgeArticles(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  query: ListKnowledgeArticlesQuery,
  context: KnowledgeArticleMutationContext,
  options: ListKnowledgeArticlesOptions,
): Promise<KnowledgeArticlePage> {
  const actor = await loadKnowledgeActorContext(loader, context);
  const limit = resolvePageSize(
    options.limit,
    options.defaultPageSize,
    options.maximumPageSize,
  );
  let position: KnowledgeArticleCursor | null =
    decodeKnowledgeArticleCursor(options.cursor);
  const collected: KnowledgeArticleRecord[] = [];
  let hasMore = false;

  for (
    let batch = 0;
    batch < knowledgeBaseConstants.maximumListScanBatches;
    batch += 1
  ) {
    const window = await fetchKnowledgeArticlesForList(prisma, query, {
      limit: knowledgeBaseConstants.listScanBatchSize,
      after: position,
    });
    const visible = await loadKnowledgeArticleVisibilities(
      prisma,
      actor,
      window.records,
      options.configuration,
    );
    collected.push(
      ...window.records.filter(
        (article) =>
          visible.has(article.id) && (options.accept?.(article) ?? true),
      ),
    );
    position = window.nextPosition;
    hasMore = window.hasMore;
    if (collected.length >= limit || position === null || !window.hasMore) {
      break;
    }
  }

  const items = collected.slice(0, limit);
  // Rows that were read but did not fit in the page (or rows the loop stopped
  // before) are still paged out: `hasMore` is about what the caller has not seen.
  const pending = collected.length > items.length || (hasMore && position !== null);
  const nextCursor = resolveNextCursor({
    items,
    scannedPosition: position,
    hasMore: pending,
    fullText: supportsFullTextSearch(prisma) && (query.q?.trim() ?? '').length > 0,
  });
  return {
    items,
    hasMore: nextCursor !== null,
    nextCursor,
  };
}

/**
 * Keyset pages resume right after the last *returned* row, so rows that were
 * read but did not fit in the page are served again instead of being skipped.
 * The offset-paged search path advances by the number of rows it scanned.
 */
function resolveNextCursor(input: {
  readonly items: readonly KnowledgeArticleRecord[];
  readonly scannedPosition: KnowledgeArticleCursor | null;
  readonly hasMore: boolean;
  readonly fullText: boolean;
}): string | null {
  if (!input.hasMore || input.scannedPosition === null) {
    return null;
  }
  const lastReturned = input.items.at(-1);
  if (input.fullText || lastReturned === undefined) {
    return encodeKnowledgeArticleCursor(input.scannedPosition);
  }
  return encodeKnowledgeArticleCursor(keysetCursorOf(lastReturned));
}
