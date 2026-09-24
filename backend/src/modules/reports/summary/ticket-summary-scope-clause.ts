import type { Prisma } from '../../../generated/prisma/client';
import type { DashboardSummaryScope } from './report-summary.types';

/**
 * The extra `where` clause of a dashboard scope.
 *
 * The three narrow scopes are exactly the ticket workspace views
 * (`view=assigned|requested|unassigned` in `ticket-page-query.ts`), so the
 * dashboard counter and the list a user clicks through to agree on the same
 * tickets: `assignedToMe` → `assignedUserId`, `requestedByMe` → `requesterId`,
 * `unassigned` → `assignedUserId IS NULL`.
 */
export function ticketSummaryScopeClause(
  scope: DashboardSummaryScope,
  actorUserId: string,
): Prisma.TicketWhereInput | null {
  if (scope === 'assignedToMe') {
    return { assignedUserId: actorUserId };
  }
  if (scope === 'requestedByMe') {
    return { requesterId: actorUserId };
  }
  if (scope === 'unassigned') {
    return { assignedUserId: null };
  }
  return null;
}
