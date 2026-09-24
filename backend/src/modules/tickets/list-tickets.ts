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
import type {
  ListTicketsQuery,
  TicketMutationContext,
  TicketRecord,
} from './tickets.types';

export type TicketListPage = {
  readonly records: readonly TicketRecord[];
  readonly total: number;
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
  const { records, total } = await runTicketListQuery(
    prisma,
    authorizationContextLoader,
    query,
    context,
    archive,
    { skip: (page - 1) * pageSize, take: pageSize },
    true,
    ticketListSelect,
  );
  return { records, total, page, pageSize };
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
): Promise<readonly TicketRecord[]> {
  const { records } = await runTicketListQuery(
    prisma,
    authorizationContextLoader,
    query,
    context,
    archive,
    { skip: 0, take: Math.max(limit, 1) },
    false,
    null,
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
): Promise<{ readonly records: readonly TicketRecord[]; readonly total: number }> {
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
    return { records: [], total: 0 };
  }
  const orderBy = buildTicketListOrderBy(query.sort, query.dir);
  const findManyArguments: Prisma.TicketFindManyArgs = {
    where,
    orderBy,
    ...paging,
  };
  if (select !== null) {
    findManyArguments.select = select;
  }
  const records = (await prisma.ticket.findMany(
    findManyArguments,
  )) as unknown as TicketRecord[];
  if (!countTotal) {
    return { records, total: records.length };
  }
  const total = await prisma.ticket.count({ where });
  return { records, total };
}
