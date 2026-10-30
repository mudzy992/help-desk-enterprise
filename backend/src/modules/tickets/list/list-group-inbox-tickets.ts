import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { buildTicketSurfaceVisibility } from './build-ticket-surface-visibility';
import { TicketAssignmentConfigurationLoader } from '../assignment/ticket-assignment-configuration.loader';
import { defaultTicketConfidentialConfiguration } from '../confidential/confidential.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { buildTicketListOrderBy } from './build-ticket-list-order-by';
import { countTicketsCapped } from './count-tickets-capped';
import { ticketListPaging } from './list-tickets.constants';
import { loadTicketVisibilityInputs } from './load-ticket-visibility-inputs';
import { ticketResponseRelations } from '../ticket-response-relations';

export type GroupInboxPage = {
  readonly records: readonly TicketRecord[];
  readonly total: number;
  /** See `countTicketsCapped`: `total` stopped at the cap. */
  readonly totalIsCapped?: boolean;
  /** Package 5.2.3 (M8 B5): epoch ms of the total calculation (always fresh for group inbox). */
  readonly totalsAsOf: number;
  readonly page: number;
  readonly pageSize: number;
};

/**
 * The group inbox as one page: unassigned `PENDING` tickets handed to a
 * group the caller belongs to (SuperAdmin: any group), visible by scope and
 * confidentiality. Same `where` builder as `GET /tickets/counts`, so the
 * inbox and its badge always agree. Default sort is the closest SLA deadline,
 * because that is the order a queue should be worked in.
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
  const [records, counted] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ticketResponseRelations,
      relationLoadStrategy: 'join',
    }) as Promise<TicketRecord[]>,
    countTicketsCapped(prisma, where),
  ]);
  return { records, ...counted, totalsAsOf: Date.now(), page, pageSize };
}
