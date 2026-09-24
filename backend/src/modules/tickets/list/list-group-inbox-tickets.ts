import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { buildGroupInboxWhere } from '../assignment/build-group-inbox-where';
import { TicketAssignmentConfigurationLoader } from '../assignment/ticket-assignment-configuration.loader';
import { defaultTicketConfidentialConfiguration } from '../confidential/confidential.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { buildTicketListOrderBy } from './build-ticket-list-order-by';
import { countTicketsCapped } from './count-tickets-capped';
import { ticketListPaging } from './list-tickets.constants';
import { loadTicketVisibilityInputs } from './load-ticket-visibility-inputs';

export type GroupInboxPage = {
  readonly records: readonly TicketRecord[];
  readonly total: number;
  /** See `countTicketsCapped`: `total` stopped at the cap. */
  readonly totalIsCapped?: boolean;
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
  const visibility = {
    context: authContext,
    ...(await loadTicketVisibilityInputs(prisma, authContext.subjectId)),
    configuration:
      context.confidential ?? defaultTicketConfidentialConfiguration,
    now: new Date(),
  };
  const page = Math.max(options.page ?? ticketListPaging.defaultPage, 1);
  const pageSize = Math.min(
    Math.max(options.pageSize ?? ticketListPaging.defaultPageSize, 1),
    ticketListPaging.maxPageSize,
  );
  const inboxClauses = buildGroupInboxWhere(visibility);
  if (inboxClauses === null) {
    return { records: [], total: 0, totalIsCapped: false, page, pageSize };
  }
  const where: Prisma.TicketWhereInput = {
    AND:
      options.groupId === undefined
        ? inboxClauses
        : [...inboxClauses, { assignedGroupId: options.groupId }],
  };
  const orderBy = buildTicketListOrderBy('slaDueAt', 'asc');
  const [records, counted] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }) as Promise<TicketRecord[]>,
    countTicketsCapped(prisma, where),
  ]);
  return { records, ...counted, page, pageSize };
}
