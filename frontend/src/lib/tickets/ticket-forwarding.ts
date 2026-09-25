import type { TicketStatus } from "@/services/tickets-api";
import type { ForwardTargetGroup, ForwardTargetsResponse } from "@/services/tickets-forwarding-api";

/** Mirrors backend `forwardableTicketStatuses` (package 1.1). */
export const forwardableStatuses: readonly TicketStatus[] = [
  "UNROUTED",
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
];

/**
 * Groups the dialog offers: the current group first (reassignment to a
 * colleague), then same-OU groups, then other OUs, each by name.
 */
export function orderForwardTargets(
  targets: ForwardTargetsResponse,
): readonly ForwardTargetGroup[] {
  const rank = (group: ForwardTargetGroup): number =>
    group.id === targets.currentGroupId ? 0 : group.isCrossOu ? 2 : 1;
  return targets.groups
    .slice()
    .sort((left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name));
}

/** The previous group, when it is still an allowed target ("hand back"). */
export function findPreviousGroup(
  targets: ForwardTargetsResponse | null,
): ForwardTargetGroup | null {
  if (targets === null || targets.previousGroupId === null) {
    return null;
  }
  return targets.groups.find((group) => group.id === targets.previousGroupId) ?? null;
}

/** Reason rule as on the server; a reassignment within the group needs none. */
export function forwardReasonError(
  reason: string,
  targets: Pick<ForwardTargetsResponse, "requireReason" | "minReasonLength">,
  isReassign = false,
): boolean {
  const length = reason.replace(/\s+/g, " ").trim().length;
  return !isReassign && targets.requireReason && length < targets.minReasonLength;
}
