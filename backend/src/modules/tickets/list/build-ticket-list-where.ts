import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import type { TicketArchiveConfiguration } from '../archive/archive.types';
import { defaultTicketConfidentialConfiguration } from '../confidential/confidential.constants';
import { TicketsError } from '../tickets.error';
import type { ListTicketsQuery, TicketMutationContext } from '../tickets.types';
import {
  buildTicketListFilters,
  buildTicketStatusFilter,
} from './build-ticket-list-filters';
import { buildTicketVisibilityWhere } from './build-ticket-visibility-where';
import { loadTicketVisibilityInputs } from './load-ticket-visibility-inputs';

/**
 * The `where` behind every list read of the HTTP API: the status narrowing, the
 * request filters and the visibility clauses, in that order.
 *
 * Phase 2.4 (plan §2.4) lifted this out of `listTicketsPage` so the ticket list
 * and the dashboard/SLA counters build their scope from one single function —
 * "the counters agree with the lists" is then true by construction instead of by
 * convention. The clauses themselves are untouched: same builders, same inputs.
 *
 * Returns `null` when nothing can match (an archive-only request from somebody
 * who may not search the archive) or throws when the actor has no context.
 */
export async function buildTicketListWhere(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration,
  now: Date = new Date(),
): Promise<Prisma.TicketWhereInput | null> {
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
    return null;
  }
  const visibilityInputs = await loadTicketVisibilityInputs(
    prisma,
    authContext.subjectId,
  );
  return {
    AND: [
      statusFilter,
      ...buildTicketListFilters(query),
      ...buildTicketVisibilityWhere({
        context: authContext,
        ...visibilityInputs,
        configuration:
          context.confidential ?? defaultTicketConfidentialConfiguration,
        now,
      }),
    ],
  };
}

/**
 * Adds one more clause to an already-built list scope, keeping the `AND` shape
 * (the counters reuse it for their own narrowings, e.g. `scope=unassigned`).
 */
export function withTicketWhereClause(
  where: Prisma.TicketWhereInput,
  clause: Prisma.TicketWhereInput,
): Prisma.TicketWhereInput {
  return { AND: [where, clause] };
}
