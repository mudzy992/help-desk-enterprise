import type { Prisma } from '../../../generated/prisma/client';
import { buildUnroutedWhere } from './build-unrouted-where';

/**
 * Package 1.7 (U2/U3), 5.1.4 (E2): the cleanup sweep and the matching list/count
 * share the unrouted predicate. A fallback ticket is overdue only while it is
 * still unassigned in the currently configured target group.
 */
export function buildUnroutedOverdueWhere(input: {
  readonly cutoff: Date;
  readonly targetGroupId: string | null;
}): Prisma.TicketWhereInput {
  return {
    ...buildUnroutedWhere({ targetGroupId: input.targetGroupId }),
    createdAt: { lte: input.cutoff },
  };
}

export function unroutedCutoff(now: Date, cleanupSlaHours: number): Date {
  return new Date(now.getTime() - cleanupSlaHours * 60 * 60 * 1000);
}
