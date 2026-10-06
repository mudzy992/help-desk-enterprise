import { sqltag } from '@prisma/client/runtime/client';
import type { Prisma } from '../../../generated/prisma/client';

export const unroutedWithoutRuleStatus = 'UNROUTED' as const;
export const unroutedFallbackStatus = 'PENDING' as const;

export function isUnroutedQueueTicket(ticket: {
  readonly status: string;
  readonly routedByUnroutedFallback?: boolean;
}): boolean {
  return (
    ticket.status === unroutedWithoutRuleStatus ||
    (ticket.status === unroutedFallbackStatus &&
      ticket.routedByUnroutedFallback === true)
  );
}

export type UnroutedWhereOptions = {
  /**
   * When supplied, match only the current fallback target and only tickets
   * still unassigned there. `null` means no fallback branch is configured.
   * Omit it for the general queue, which includes every fallback-routed ticket.
   */
  readonly targetGroupId?: string | null;
};

/**
 * The canonical unrouted queue: tickets with no route (`UNROUTED`) plus tickets
 * sent through the configured fallback (`PENDING` + routedByUnroutedFallback).
 */
export function buildUnroutedWhere(
  options: UnroutedWhereOptions = {},
): Prisma.TicketWhereInput {
  const branches: Prisma.TicketWhereInput[] = [
    { status: unroutedWithoutRuleStatus },
  ];
  if (options.targetGroupId === undefined) {
    branches.push({
      status: unroutedFallbackStatus,
      routedByUnroutedFallback: true,
    });
  } else if (options.targetGroupId !== null) {
    branches.push({
      status: unroutedFallbackStatus,
      routedByUnroutedFallback: true,
      assignedGroupId: options.targetGroupId,
      assignedUserId: null,
    });
  }
  return { OR: branches };
}

/** SQL equivalent for aggregate readers that cannot consume a Prisma where. */
export function buildUnroutedSqlPredicate() {
  return sqltag`(
    t.status::text = ${unroutedWithoutRuleStatus}
    OR (
      t.status::text = ${unroutedFallbackStatus}
      AND t."routedByUnroutedFallback" = true
    )
  )`;
}
