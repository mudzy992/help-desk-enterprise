/**
 * Faza 3.2 (plan §3.2): the payload of the light group-room event. Ids and a
 * kind only — the group room never carries a title, a body or a status, so this
 * type deliberately has no room for them.
 */
export type GroupFeedChangeKind = "message" | "status" | "assign" | "sla";

export type GroupFeedChangedPayload = {
  readonly groupId: string;
  readonly ticketId: string;
  readonly kind: GroupFeedChangeKind;
  readonly occurredAt: string;
};

export function isGroupFeedChangedPayload(
  payload: unknown,
): payload is GroupFeedChangedPayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const candidate = payload as Partial<GroupFeedChangedPayload>;
  return (
    typeof candidate.groupId === "string" &&
    typeof candidate.ticketId === "string" &&
    typeof candidate.occurredAt === "string" &&
    (candidate.kind === "message" ||
      candidate.kind === "status" ||
      candidate.kind === "assign" ||
      candidate.kind === "sla")
  );
}
