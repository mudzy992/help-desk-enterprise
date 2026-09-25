import type { Prisma } from '../../../generated/prisma/client';

/**
 * Package 1.7 (U2/U3): "unrouted past the cleanup deadline" — a ticket still
 * in UNROUTED, or sent to the unrouted target group and still unassigned there.
 * Shared by the sweep, the list filter and the dashboard counter.
 */
export function buildUnroutedOverdueWhere(input: {
  readonly cutoff: Date;
  readonly targetGroupId: string | null;
}): Prisma.TicketWhereInput {
  const branches: Prisma.TicketWhereInput[] = [{ status: 'UNROUTED' }];
  if (input.targetGroupId !== null) {
    branches.push({
      status: 'PENDING',
      routedByUnroutedFallback: true,
      assignedGroupId: input.targetGroupId,
      assignedUserId: null,
    });
  }
  return { createdAt: { lte: input.cutoff }, OR: branches };
}

export function unroutedCutoff(now: Date, cleanupSlaHours: number): Date {
  return new Date(now.getTime() - cleanupSlaHours * 60 * 60 * 1000);
}
