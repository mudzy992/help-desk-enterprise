import { createHash } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { getRequestId } from '../../../common/request-context/request-context.storage';
import { recordDbQueryTraceLabel } from '../../../common/database/db-query-counter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { buildTicketSurfaceVisibility } from './build-ticket-surface-visibility';
import { TicketAssignmentConfigurationLoader } from '../assignment/ticket-assignment-configuration.loader';
import { defaultTicketConfidentialConfiguration } from '../confidential/confidential.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { buildTicketListOrderBy } from './build-ticket-list-order-by';
import { countTicketsCapped } from './count-tickets-capped';
import {
  ticketListTotalCacheTtlMs,
  ticketListTotals,
} from './ticket-list-total-cache';
import { ticketListPaging } from './list-tickets.constants';
import { loadTicketVisibilityInputs } from './load-ticket-visibility-inputs';
import { ticketResponseRelations } from '../ticket-response-relations';

export type GroupInboxPage = {
  readonly records: readonly TicketRecord[];
  readonly total: number;
  /** See `countTicketsCapped`: `total` stopped at the cap. */
  readonly totalIsCapped?: boolean;
  /** Epoch ms of the total calculation; the total may lag by the shared list-count TTL. */
  readonly totalsAsOf: number;
  readonly page: number;
  readonly pageSize: number;
};

function normalizeTotalCacheKeyValue(value: unknown, dateBucketMs: number): unknown {
  if (value instanceof Date) {
    return ['$dateBucket', Math.floor(value.getTime() / dateBucketMs)];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeTotalCacheKeyValue(entry, dateBucketMs));
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [
        key,
        normalizeTotalCacheKeyValue(entry, dateBucketMs),
      ]);
    return Object.fromEntries(entries);
  }
  return value;
}

function groupInboxTotalCacheKey(
  context: TicketMutationContext,
  groupId: string | undefined,
  where: Prisma.TicketWhereInput,
): string {
  const configuredTtlMs = ticketListTotalCacheTtlMs();
  const dateBucketMs = configuredTtlMs > 0 ? configuredTtlMs : 30_000;
  const keyMaterial = JSON.stringify([
    context.actorUserId,
    context.principalAuthzVersion ?? null,
    [...(context.principalGroupIds ?? [])].sort(),
    groupId ?? null,
    normalizeTotalCacheKeyValue(where, dateBucketMs),
  ]);
  return `group-inbox:${createHash('sha256').update(keyMaterial).digest('hex')}`;
}

/**
 * The group inbox as one page: unassigned `PENDING` tickets handed to a
 * group the caller belongs to (SuperAdmin: any group), visible by scope and
 * confidentiality. It uses the same visibility predicate as `GET /tickets/counts`;
 * only the total is cached for the shared short TTL, while ticket rows are fresh.
 * Default sort is the closest SLA deadline, because that is the order a queue
 * should be worked in.
 */
export async function listGroupInboxTickets(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configurationLoader: TicketAssignmentConfigurationLoader,
  context: TicketMutationContext,
  options: {
    readonly groupId?: string;
    readonly page?: number;
    readonly pageSize?: number;
  } = {},
): Promise<GroupInboxPage> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const configuration = await configurationLoader.load();
  if (!configuration.groupInboxEnabled) {
    throw new TicketsError('GROUP_INBOX_DISABLED');
  }
  const confidential =
    context.confidential ?? defaultTicketConfidentialConfiguration;
  const visibility = {
    context: authContext,
    ...(await loadTicketVisibilityInputs(prisma, authContext.subjectId, {
      // Ticket-level membership and group grants use relation predicates. Only
      // actor-global confidential viewer groups need a separate id catalogue.
      includeActorGroupIds:
        confidential.enabled && confidential.allowedViewerGroupIds.length > 0,
    })),
    actorMembershipUserId: authContext.subjectId,
    configuration: confidential,
    now: new Date(),
  };
  const page = Math.max(options.page ?? ticketListPaging.defaultPage, 1);
  const pageSize = Math.min(
    Math.max(options.pageSize ?? ticketListPaging.defaultPageSize, 1),
    ticketListPaging.maxPageSize,
  );
  const surfaceWhere = buildTicketSurfaceVisibility({ surface: 'group_inbox', visibility });
  if (surfaceWhere === null) {
    return { records: [], total: 0, totalIsCapped: false, totalsAsOf: Date.now(), page, pageSize };
  }
  const where: Prisma.TicketWhereInput = options.groupId === undefined
    ? surfaceWhere
    : { AND: [surfaceWhere, { assignedGroupId: options.groupId }] };
  const orderBy = buildTicketListOrderBy('slaDueAt', 'asc');
  const totalsCache = ticketListTotals(prisma);
  const totalsKey = groupInboxTotalCacheKey(context, options.groupId, where);
  if (process.env.DB_QUERY_TRACE === 'true') {
    const totalCacheState =
      totalsCache.computedAt(totalsKey) === null ? 'miss_or_in_flight' : 'hit';
    recordDbQueryTraceLabel(
      getRequestId(),
      `group_inbox_total_cache=${totalCacheState};key=${totalsKey.slice('group-inbox:'.length)}`,
    );
  }
  const [records, counted] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ticketResponseRelations,
      relationLoadStrategy: 'join',
    }) as Promise<TicketRecord[]>,
    totalsCache.get(totalsKey, () => countTicketsCapped(prisma, where)),
  ]);
  const totalsAsOf = totalsCache.computedAt(totalsKey) ?? Date.now();
  return { records, ...counted, totalsAsOf, page, pageSize };
}
