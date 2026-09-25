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

/** Groups the dialog offers: never the current group, same-OU first, then by name. */
export function orderForwardTargets(
  targets: ForwardTargetsResponse,
): readonly ForwardTargetGroup[] {
  return targets.groups
    .filter((group) => group.id !== targets.currentGroupId)
    .slice()
    .sort((left, right) =>
      left.isCrossOu === right.isCrossOu
        ? left.name.localeCompare(right.name)
        : left.isCrossOu
          ? 1
          : -1,
    );
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

export function forwardReasonError(
  reason: string,
  targets: Pick<ForwardTargetsResponse, "requireReason" | "minReasonLength">,
): boolean {
  const length = reason.replace(/\s+/g, " ").trim().length;
  return targets.requireReason && length < targets.minReasonLength;
}
