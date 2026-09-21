import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { defaultTicketArchiveConfiguration } from './archive/archive.constants';
import type { TicketArchiveConfiguration } from './archive/archive.types';
import { defaultTicketConfidentialConfiguration } from './confidential/confidential.constants';
import {
  buildTicketListFilters,
  buildTicketStatusFilter,
} from './list/build-ticket-list-filters';
import { buildTicketListOrderBy } from './list/build-ticket-list-order-by';
import { buildTicketVisibilityWhere } from './list/build-ticket-visibility-where';
import { ticketListPaging } from './list/list-tickets.constants';
import { loadTicketVisibilityInputs } from './list/load-ticket-visibility-inputs';
import { TicketsError } from './tickets.error';
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

/** Every visible ticket that matches, unpaged (export, CSAT summary, legacy). */
export async function listTickets(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration = defaultTicketArchiveConfiguration,
): Promise<readonly TicketRecord[]> {
  const result = await runTicketListQuery(
    prisma,
    authorizationContextLoader,
    query,
    context,
    archive,
    null,
  );
  return result.records;
}

/** One page of the visible, matching tickets plus the total across pages. */
export async function listTicketsPage(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration = defaultTicketArchiveConfiguration,
): Promise<TicketListPage> {
  const page = Math.max(query.page ?? ticketListPaging.defaultPage, 1);
  const pageSize = Math.min(
    Math.max(query.pageSize ?? ticketListPaging.defaultPageSize, 1),
    ticketListPaging.maxPageSize,
  );
  const result = await runTicketListQuery(
    prisma,
    authorizationContextLoader,
    query,
    context,
    archive,
    { skip: (page - 1) * pageSize, take: pageSize },
  );
  return { ...result, page, pageSize };
}

async function runTicketListQuery(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration,
  paging: Paging | null,
): Promise<{ readonly records: readonly TicketRecord[]; readonly total: number }> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const statusFilter = buildTicketStatusFilter(
    query,
    archive.searchable || authContext.isSuperAdmin,
  );
  if (statusFilter === null) {
    return { records: [], total: 0 };
  }
  const visibilityInputs = await loadTicketVisibilityInputs(
    prisma,
    authContext.subjectId,
  );
  const where: Prisma.TicketWhereInput = {
    AND: [
      statusFilter,
      ...buildTicketListFilters(query),
      ...buildTicketVisibilityWhere({
        context: authContext,
        ...visibilityInputs,
        configuration:
          context.confidential ?? defaultTicketConfidentialConfiguration,
        now: new Date(),
      }),
    ],
  };
  const orderBy = buildTicketListOrderBy(query.sort, query.dir);
  if (paging === null) {
    const records = (await prisma.ticket.findMany({
      where,
      orderBy,
    })) as TicketRecord[];
    return { records, total: records.length };
  }
  const [records, total] = await Promise.all([
    prisma.ticket.findMany({ where, orderBy, ...paging }) as Promise<
      TicketRecord[]
    >,
    prisma.ticket.count({ where }),
  ]);
  return { records, total };
}
