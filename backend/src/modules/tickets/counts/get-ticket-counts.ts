import type { Prisma } from '../../../generated/prisma/client';
import type { TicketStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { defaultTicketArchiveConfiguration } from '../archive/archive.constants';
import type { TicketArchiveConfiguration } from '../archive/archive.types';
import { buildGroupInboxWhere } from '../assignment/build-group-inbox-where';
import { defaultTicketConfidentialConfiguration } from '../confidential/confidential.constants';
import { buildTicketListFilters } from '../list/build-ticket-list-filters';
import { buildTicketVisibilityWhere } from '../list/build-ticket-visibility-where';
import { loadTicketVisibilityInputs } from '../list/load-ticket-visibility-inputs';
import { ticketStatuses } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import type { TicketCounts, TicketCountsQuery } from './counts.types';

const closedStatuses: ReadonlySet<TicketStatus> = new Set([
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
]);

/**
 * Counts for the sidebar and the list tabs, over exactly the tickets the
 * caller may list (same visibility predicate and filters as `GET /tickets`),
 * so a badge and the list it opens agree. Four independent queries run in
 * parallel; no ticket is loaded.
 */
export async function getTicketCounts(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly query: TicketCountsQuery;
  readonly context: TicketMutationContext;
  readonly archive?: TicketArchiveConfiguration;
  readonly groupInboxEnabled: boolean;
}): Promise<TicketCounts> {
  const authContext = await input.authorizationContextLoader.loadBySubjectId(
    input.context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const archive = input.archive ?? defaultTicketArchiveConfiguration;
  const visibility = {
    context: authContext,
    ...(await loadTicketVisibilityInputs(input.prisma, authContext.subjectId)),
    configuration:
      input.context.confidential ?? defaultTicketConfidentialConfiguration,
    now: new Date(),
  };
  const scope: Prisma.TicketWhereInput[] = [
    ...buildTicketListFilters(input.query),
    ...buildTicketVisibilityWhere(visibility),
  ];
  // The default list hides the archive, and so do the SLA counts.
  const listed = (state: Parameters<typeof buildTicketListFilters>[0]) => ({
    AND: [
      { status: { not: 'ARCHIVED' } } satisfies Prisma.TicketWhereInput,
      ...buildTicketListFilters(state),
      ...scope,
    ],
  });
  const inboxClauses = input.groupInboxEnabled
    ? buildGroupInboxWhere(visibility)
    : null;
  const [grouped, overdue, atRisk, inbox] = await Promise.all([
    input.prisma.ticket.groupBy({
      by: ['status'],
      where: { AND: scope },
      _count: { _all: true },
    }),
    input.prisma.ticket.count({ where: listed({ overdue: true }) }),
    input.prisma.ticket.count({ where: listed({ atRisk: true }) }),
    inboxClauses === null
      ? Promise.resolve(0)
      : input.prisma.ticket.count({ where: { AND: inboxClauses } }),
  ]);
  const byStatus = Object.fromEntries(
    ticketStatuses.map((status) => [status, 0]),
  ) as Record<TicketStatus, number>;
  for (const row of grouped) {
    byStatus[row.status as TicketStatus] = row._count._all;
  }
  if (!archive.searchable && !authContext.isSuperAdmin) {
    byStatus.ARCHIVED = 0;
  }
  return {
    open: ticketStatuses
      .filter((status) => !closedStatuses.has(status))
      .reduce((sum, status) => sum + byStatus[status], 0),
    unrouted: byStatus.UNROUTED,
    inbox,
    overdue,
    atRisk,
    byStatus,
  };
}
