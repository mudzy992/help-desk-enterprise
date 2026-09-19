import type { MessageType } from "@/services/tickets-collaboration-api";
import type { TicketResponse } from "@/services/tickets-api";

export type ComposerAccess = "requester" | "staff" | "both";

export function resolveComposerAccess(input: {
  readonly ticket: TicketResponse;
  readonly currentUserId: string | null;
  readonly inboxAccessible: boolean;
  /**
   * Role-based staff signal from the session. `inboxAccessible` is not a
   * reliable proxy: the inbox endpoint answers 200 with an empty list to any
   * signed-in user, requesters included. When provided, this replaces it.
   */
  readonly actorIsStaff?: boolean;
}): ComposerAccess {
  const isRequester =
    input.currentUserId !== null && input.ticket.requesterId === input.currentUserId;
  const isStaff =
    (input.actorIsStaff ?? input.inboxAccessible) ||
    (input.currentUserId !== null && input.ticket.assignedUserId === input.currentUserId);
  if (isRequester && isStaff) {
    return "both";
  }
  if (isStaff) {
    return "staff";
  }
  return "requester";
}

export function messageTypesForAccess(access: ComposerAccess): readonly MessageType[] {
  if (access === "staff") {
    return ["AGENT_REPLY", "INTERNAL_NOTE"];
  }
  if (access === "both") {
    return ["USER_REPLY", "AGENT_REPLY", "INTERNAL_NOTE"];
  }
  return ["USER_REPLY"];
}

export function defaultMessageType(access: ComposerAccess): MessageType {
  return access === "requester" ? "USER_REPLY" : "AGENT_REPLY";
}
