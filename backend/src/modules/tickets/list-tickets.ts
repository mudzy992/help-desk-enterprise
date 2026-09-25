import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { defaultTicketArchiveConfiguration } from './archive/archive.constants';
import type { TicketArchiveConfiguration } from './archive/archive.types';
import { buildTicketListWhere } from './list/build-ticket-list-where';
import { buildTicketListOrderBy } from './list/build-ticket-list-order-by';
import { ticketListPaging } from './list/list-tickets.constants';
import { clampTicketListPageSize } from './list/clamp-ticket-list-page-size';
import { ticketListSelect } from './list/ticket-list-select';
import {
  createPerClientSingleFlightCache,
  readTtlMsFromEnvironment,
} from '../../common/cache/single-flight-cache';
import {
  countTicketsCapped,
  type CappedTicketTotal,
} from './list/count-tickets-capped';

/**
 * Staging slow log (2026-09-25, 100k tickets): the capped `COUNT` (≤ 10 001
 * visible rows) took ~350 ms on EVERY page request while the page itself was
 * fast. The total is the same for every page, sort and direction of a filter,
 * so it is single-flighted and reused per user + filter for
 * `TICKET_LIST_TOTAL_CACHE_TTL_MS` (default 30 s, 0 in tests). The rows are
 * never cached; only the "N tickets / page x of y" figure may lag.
 */
const ticketListTotals = createPerClientSingleFlightCache<CappedTicketTotal>({
  ttlMs: () =>
    readTtlMsFromEnvironment(
      'TICKET_LIST_TOTAL_CACHE_TTL_MS',
      process.env.NODE_ENV === 'test' ? 0 : 30_000,
    ),
  maxEntries: 5000,
});

function ticketListTotalKey(
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration,
): string {
  const { page: _page, pageSize: _pageSize, sort: _sort, dir: _dir, ...filters } =
    query as ListTicketsQuery & Record<string, unknown>;
  return JSON.stringify([
    context.actorUserId,
    filters,
    archive,
    context.confidential ?? null,
  ]);
}
import type {
  ListTicketsQuery,
  TicketMutationContext,
  TicketRecord,
} from './tickets.types';

export type TicketListPage = {
  readonly records: readonly TicketRecord[];
  readonly total: number;
  /** See `countTicketsCapped`: `total` stopped at the cap. */
  readonly totalIsCapped?: boolean;
  readonly page: number;
  readonly pageSize: number;
};

type Paging = { readonly skip: number; readonly take: number };

/**
 * One page of the visible, matching tickets plus the total across pages.
 *
 * Phase 1.1 (plan §1.1): this is the only list read of the HTTP API. It used to
 * have an unpaged sibling that ran `findMany` without `take` whenever the caller
 * omitted `page`/`pageSize`, which sent the whole ticket table to the client.
 */
export async function listTicketsPage(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration = defaultTicketArchiveConfiguration,
): Promise<TicketListPage> {
  const pageSize = clampTicketListPageSize(query.pageSize);
  const page = Math.max(query.page ?? ticketListPaging.defaultPage, 1);
  const { records, total, totalIsCapped } = await runTicketListQuery(
    prisma,
    authorizationContextLoader,
    query,
    context,
    archive,
    { skip: (page - 1) * pageSize, take: pageSize },
    true,
    ticketListSelect,
  );
  return { records, total, totalIsCapped, page, pageSize };
}

/**
 * Bounded read for the server-side readers that need whole rows rather than a
 * page: the CSV export and the CSAT summary.
 *
 * Phase 1.1 removed the unbounded variant, so each caller states its own limit
 * — that limit is what keeps the statement (`LIMIT n`) bounded in Postgres. The
 * row shape stays complete here (export columns and CSAT grouping both read
 * `formData`-adjacent fields), so no `select` projection is applied.
 */
export async function listTicketsWithin(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration,
  limit: number,
  /** Narrow projection for callers that read a few columns (global search). */
  select: Prisma.TicketSelect | null = null,
): Promise<readonly TicketRecord[]> {
  const { records } = await runTicketListQuery(
    prisma,
    authorizationContextLoader,
    query,
    context,
    archive,
    { skip: 0, take: Math.max(limit, 1) },
    false,
    select,
  );
  return records;
}

async function runTicketListQuery(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration,
  paging: Paging,
  countTotal: boolean,
  select: Prisma.TicketSelect | null,
): Promise<{
  readonly records: readonly TicketRecord[];
  readonly total: number;
  readonly totalIsCapped: boolean;
}> {
  // Phase 2.4: the scope comes from the shared builder, which the dashboard and
  // SLA counters use as well.
  const where = await buildTicketListWhere(
    prisma,
    authorizationContextLoader,
    query,
    context,
    archive,
  );
  if (where === null) {
    return { records: [], total: 0, totalIsCapped: false };
  }
  const orderBy = buildTicketListOrderBy(query.sort, query.dir);
  // k6 C (200 VU): search was the only read over budget (p95 763 ms) — the
  // capped COUNT re-ran the ILIKE over up to 10 001 rows for every keystroke-ish
  // query and is never reused (each `q` is a new cache key). With `q` the page
  // reads one extra row instead and reports "more exist" through
  // `totalIsCapped`, so the client shows "N+" and keeps the next-page button.
  const searchWithoutCount =
    countTotal && (query.q?.trim().length ?? 0) > 0;
  const findManyArguments: Prisma.TicketFindManyArgs = {
    where,
    orderBy,
    skip: paging.skip,
    take: searchWithoutCount ? paging.take + 1 : paging.take,
  };
  if (select !== null) {
    findManyArguments.select = select;
  }
  const records = (await prisma.ticket.findMany(
    findManyArguments,
  )) as unknown as TicketRecord[];
  if (searchWithoutCount) {
    const hasMore = records.length > paging.take;
    const pageRecords = hasMore ? records.slice(0, paging.take) : records;
    return {
      records: pageRecords,
      // One past the page when more exist, so `ceil(total / pageSize)` opens
      // the next page; exact when this is the last page.
      total: paging.skip + pageRecords.length + (hasMore ? 1 : 0),
      totalIsCapped: hasMore,
    };
  }
  if (!countTotal) {
    return { records, total: records.length, totalIsCapped: false };
  }
  const { total, totalIsCapped } = await ticketListTotals(prisma).get(
    ticketListTotalKey(query, context, archive),
    () => countTicketsCapped(prisma, where),
  );
  return { records, total, totalIsCapped };
}
