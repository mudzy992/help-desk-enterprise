import type { Prisma } from '../../generated/prisma/client';
import { unitScopeWhere } from '../assets/asset-viewer';
import type { ProblemScope } from './problem-access.service';

/** Tickets the user works on: assigned to them or to one of their groups. */
export function linkedTicketWorkWhere(userId: string): Prisma.TicketWhereInput {
  return { OR: [{ assignedUserId: userId }, { assignedGroup: { members: { some: { userId } } } }] };
}

/** Full problem access is only granted by the relevant permission's OU scope. */
export function problemVisibilityWhere(scope: ProblemScope, _userId: string): Prisma.ProblemWhereInput | null {
  if (scope.all) return null;
  // Do not pass the shared empty-scope sentinel containing NUL to PostgreSQL.
  if (scope.paths.length === 0) return { id: { in: [] } };
  return { organizationalUnit: unitScopeWhere(scope)! };
}
