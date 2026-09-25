import type { Prisma } from '../../../generated/prisma/client';
import type { TicketStatus } from '../../../generated/prisma/enums';
import {
  createPerClientSingleFlightCache,
  readTtlMsFromEnvironment,
} from '../../../common/cache/single-flight-cache';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { defaultTicketArchiveConfiguration } from '../archive/archive.constants';
import type { TicketArchiveConfiguration } from '../archive/archive.types';
import { buildGroupInboxWhere } from '../assignment/build-group-inbox-where';
import { defaultTicketConfidentialConfiguration } from '../confidential/confidential.constants';
import { buildTicketListFilters } from '../list/build-ticket-list-filters';
import { buildTicketVisibilityWhere } from '../list/build-ticket-visibility-where';
import { loadTicketVisibilityInputs } from '../list/load-ticket-visibility-inputs';
import { unroutedCutoff } from '../unrouted/build-unrouted-overdue-where';
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
 * Staging k6 (2026-09-24): the sidebar asks for these on every navigation and
 * every realtime nudge; over 100k visible tickets each call is a GROUP BY plus
 * three COUNTs. Concurrent calls with the same inputs share one computation and
 * the answer is reused for `TICKET_COUNTS_CACHE_TTL_MS` (default 5 s, 0 in
 * tests so a write is visible to the next read). Badges may lag by that long;
 * the list itself is never cached.
 */
const ticketCountsFlights = createPerClientSingleFlightCache<TicketCounts>({
  ttlMs: () =>
    readTtlMsFromEnvironment(
      'TICKET_COUNTS_CACHE_TTL_MS',
      process.env.NODE_ENV === 'test' ? 0 : 5000,
    ),
  maxEntries: 5000,
});

type GetTicketCountsInput = {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly query: TicketCountsQuery;
  readonly context: TicketMutationContext;
  readonly archive?: TicketArchiveConfiguration;
  readonly groupInboxEnabled: boolean;
  /** Package 1.7 (U3); absent → counter reported as 0. */
  readonly unrouted?: {
    readonly cleanupSlaHours: number;
    readonly targetGroupId: string | null;
  };
};

export function getTicketCounts(input: GetTicketCountsInput): Promise<TicketCounts> {
  const key = JSON.stringify([
    input.context.actorUserId,
    input.query,
    input.archive ?? null,
    input.context.confidential ?? null,
    input.groupInboxEnabled,
    input.unrouted ?? null,
  ]);
  return ticketCountsFlights(input.prisma).get(key, () =>
    computeTicketCounts(input),
  );
}

/**
 * Counts for the sidebar and the list tabs, over exactly the tickets the
 * caller may list (same visibility predicate and filters as `GET /tickets`),
 * so a badge and the list it opens agree. Four independent queries run in
 * parallel; no ticket is loaded.
 */
async function computeTicketCounts(input: GetTicketCountsInput): Promise<TicketCounts> {
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
  const unroutedHours = input.unrouted?.cleanupSlaHours ?? 0;
  const [grouped, overdue, atRisk, inbox, unroutedOverdue] = await Promise.all([
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
    unroutedHours === 0
      ? Promise.resolve(0)
      : input.prisma.ticket.count({
          where: listed({
            unroutedOverdue: true,
            unroutedOverdueScope: {
              cutoffIso: unroutedCutoff(new Date(), unroutedHours).toISOString(),
              targetGroupId: input.unrouted?.targetGroupId ?? null,
            },
          }),
        }),
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
    unroutedOverdue,
    unroutedCleanupHours: unroutedHours,
    byStatus,
  };
}
