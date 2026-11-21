import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { knowledgeBaseConstants } from './knowledge-base.constants';
import { loadKnowledgeArticleVisibilities } from './load-knowledge-article-scope';
import { loadKnowledgeActorContext } from './load-knowledge-actor-context';
import {
  knowledgeArticleTitleSearchSelect,
  type KnowledgeArticleTitleSearchCandidate,
  type KnowledgeArticleTitleSearchRow,
} from './search-knowledge-article-projection';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeBaseConfiguration,
} from './knowledge-base.types';

export type KnowledgeArticleTitleMatch = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
};

export type KnowledgeArticleTitleSearchResult = {
  readonly items: readonly KnowledgeArticleTitleMatch[];
  /**
   * W7.57 (BA-search-03): `true` when the scan stopped before exhausting the
   * matching rows — either the hit limit was reached or the scan budget ran
   * out. Without this flag a short (or empty) group is indistinguishable from
   * "there is nothing else", which is what the audit objected to.
   */
  readonly incomplete: boolean;
};

type KeysetPosition = {
  readonly updatedAt: Date;
  readonly id: string;
};

type TitleCandidateWindow = {
  readonly records: readonly KnowledgeArticleTitleSearchCandidate[];
  /** The database reported candidate rows beyond this window. */
  readonly hasMore: boolean;
  /** Position right after the last row of the window; `null` when empty. */
  readonly nextPosition: KeysetPosition | null;
};

/**
 * Title search behind `GET /search?types=article` (plan §1.2).
 *
 * W7.57 (BA-search-03): the old read took `limit × 3` title matches ordered by
 * `updatedAt desc` and filtered them by visibility afterwards. When those first
 * rows belonged to other organizational units or services, the caller got an
 * empty or short group even though older *visible* matches existed; 45 rows were
 * a fixed multiplier, not a proof of completeness.
 *
 * The scan is now a **keyset walk** over the same bounded batch size the
 * article list uses (`listScanBatchSize` rows per batch, at most
 * `maximumListScanBatches` batches), and visibility is decided per batch with
 * the existing batch check (a handful of queries per batch instead of three per
 * row). Two properties follow:
 *
 * 1. up to 200 candidates are considered instead of 45, and the walk continues
 *    after invisible rows instead of stopping at them;
 * 2. when the budget ends (or the hit limit is filled) with rows still unseen,
 *    `incomplete` is `true`, so the answer never claims to be exhaustive when it
 *    is not.
 *
 * A database-side scope pushdown was considered and rejected for this package:
 * readable-ness depends on classification, status, OU path, service scope,
 * three permission keys, owner/reviewer identity and owner-group membership, so
 * a SQL mirror would be a second, divergent copy of the authorization rule. The
 * bounded walk keeps one policy.
 *
 * W7.58 (BA-search-04): the walk reads a **projection**, not the whole row. The
 * output columns (`id`, `slug`, `title`), the columns the predicate reads and
 * the keyset position are all this endpoint needs; `body` and the rest of the
 * article text are never selected, so an invisible candidate is never
 * materialized with its content. Before this change the query had no `select`
 * and every candidate arrived with its full text before the visibility check.
 */
export async function searchKnowledgeArticleTitles(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly context: KnowledgeArticleMutationContext;
  readonly query: string;
  readonly limit: number;
  /** W7.79 (`BA-knowledge-base-05`): the INTERNAL audience policy of this installation. */
  readonly configuration: KnowledgeBaseConfiguration;
}): Promise<KnowledgeArticleTitleSearchResult> {
  const actor = await loadKnowledgeActorContext(
    input.authorizationContextLoader,
    input.context,
  );
  const matches: KnowledgeArticleTitleMatch[] = [];
  let after: KeysetPosition | null = null;
  let incomplete = false;

  for (
    let batch = 0;
    batch < knowledgeBaseConstants.maximumListScanBatches;
    batch += 1
  ) {
    const window = await loadTitleCandidateWindow(input.prisma, {
      query: input.query,
      batchSize: knowledgeBaseConstants.listScanBatchSize,
      after,
    });
    if (window.records.length === 0) {
      incomplete = false;
      break;
    }
    const visible = await loadKnowledgeArticleVisibilities(
      input.prisma,
      actor,
      window.records,
      input.configuration,
    );
    const visibleRecords = window.records.filter((record) =>
      visible.has(record.id),
    );
    let consumed = 0;
    while (consumed < visibleRecords.length && matches.length < input.limit) {
      const record = visibleRecords[consumed];
      if (record === undefined) {
        break;
      }
      matches.push({ id: record.id, slug: record.slug, title: record.title });
      consumed += 1;
    }
    if (matches.length >= input.limit) {
      // Hits that fit were returned; anything this window or the database still
      // holds is a hit the caller did not see.
      incomplete = consumed < visibleRecords.length || window.hasMore;
      break;
    }
    if (!window.hasMore) {
      incomplete = false;
      break;
    }
    after = window.nextPosition;
    // Budget: the last allowed batch still reported rows beyond itself.
    incomplete = batch + 1 === knowledgeBaseConstants.maximumListScanBatches;
  }

  return { items: matches, incomplete };
}

async function loadTitleCandidateWindow(
  prisma: PrismaService,
  input: {
    readonly query: string;
    readonly batchSize: number;
    readonly after: KeysetPosition | null;
  },
): Promise<TitleCandidateWindow> {
  // `(updatedAt desc, id asc)` is a total order, so the keyset resumes exactly
  // after the last scanned row: no offset scan, no skipped or duplicated row,
  // and no dependence on `displayName`-style non-unique columns.
  const rows = (await prisma.knowledgeArticle.findMany({
    where: {
      title: { contains: input.query, mode: 'insensitive' },
      status: { not: 'ARCHIVED' },
      ...(input.after === null
        ? {}
        : {
            OR: [
              { updatedAt: { lt: input.after.updatedAt } },
              { updatedAt: input.after.updatedAt, id: { gt: input.after.id } },
            ],
          }),
    },
    // W7.58 (BA-search-04): the single guard against reading hidden text — no
    // `body`, no counters, no category/FAQ metadata. See
    // `search-knowledge-article-projection.ts`.
    select: knowledgeArticleTitleSearchSelect,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: input.batchSize + 1,
  })) as KnowledgeArticleTitleSearchRow[];
  const hasMore = rows.length > input.batchSize;
  const records = hasMore ? rows.slice(0, input.batchSize) : rows;
  const last = records.at(-1);
  return {
    records,
    hasMore,
    nextPosition:
      last === undefined ? null : { updatedAt: last.updatedAt, id: last.id },
  };
}
