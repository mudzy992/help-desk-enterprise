import type { Prisma } from '../../generated/prisma/client';
import { unitScopeWhere } from '../assets/asset-viewer';
import type { ProblemScope } from './problem-access.service';

/** Tickets the user works on: assigned to them or to one of their groups. */
export function linkedTicketWorkWhere(userId: string): Prisma.TicketWhereInput {
  return { OR: [{ assignedUserId: userId }, { assignedGroup: { members: { some: { userId } } } }] };
}

/**
 * §12: a problem is visible inside the unit scope of the permission or when
 * the user works on one of its linked tickets. null = no restriction.
 */
export function problemVisibilityWhere(scope: ProblemScope, userId: string): Prisma.ProblemWhereInput | null {
  const unitWhere = unitScopeWhere(scope);
  if (unitWhere === null) return null;
  return { OR: [{ organizationalUnit: unitWhere }, { tickets: { some: { ticket: linkedTicketWorkWhere(userId) } } }] };
}
