import { canShowClaimAction } from "@/lib/tickets/ticket-actions";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import type { TicketResponse } from "@/services/tickets-api";
import type {
  TicketAllowedActions,
  TicketComposerAccess,
} from "@/services/tickets-context-api";

export type TicketActionView = TicketAllowedActions;

export type TicketActionSessionFacts = {
  readonly currentUserId: string | null;
  readonly isSuperAdmin: boolean;
  readonly roleKeys: readonly string[];
  readonly permissionKeys: readonly string[];
};

const noActions: Omit<TicketActionView, "composerAccess"> = {
  claim: false,
  assign: false,
  changeStatus: false,
  split: false,
  requestRemote: false,
  addInternalNote: false,
  waitForUser: false,
  manageParticipants: false,
  trackTime: false,
  uploadAttachments: false,
  viewActivity: false,
};

/**
 * Which ticket actions the screen offers. The server answer is authoritative
 * because it evaluates scope and group membership. Until it arrives, or when
 * it cannot be loaded, the screen falls back to what the session's roles and
 * permissions allow, and offers nothing before the session itself is known.
 */
export function resolveTicketActionView(input: {
  readonly allowed: TicketAllowedActions | null;
  readonly ticket: TicketResponse;
  readonly session: TicketActionSessionFacts | null;
}): TicketActionView {
  if (input.allowed !== null) {
    return input.allowed;
  }
  return deriveActionsFromSession(input.ticket, input.session);
}

export function deriveActionsFromSession(
  ticket: TicketResponse,
  session: TicketActionSessionFacts | null,
): TicketActionView {
  if (session === null) {
    return { composerAccess: "requester", ...noActions };
  }
  const isStaff =
    session.isSuperAdmin ||
    session.roleKeys.includes(roleKeys.agent) ||
    session.roleKeys.includes(roleKeys.admin);
  const isRequester =
    session.currentUserId !== null && ticket.requesterId === session.currentUserId;
  const composerAccess: TicketComposerAccess =
    isStaff && isRequester ? "both" : isStaff ? "staff" : "requester";
  const writable = ticket.status !== "ARCHIVED";
  const staffCanWrite = isStaff && writable;
  const holds = (permission: string): boolean =>
    session.isSuperAdmin || session.permissionKeys.includes(permission);
  return {
    composerAccess,
    claim: staffCanWrite && canShowClaimAction(ticket),
    assign: staffCanWrite && holds(permissionKeys.ticketBulkAssign),
    changeStatus: staffCanWrite,
    split: staffCanWrite,
    requestRemote: staffCanWrite,
    addInternalNote: staffCanWrite,
    waitForUser: staffCanWrite,
    manageParticipants: staffCanWrite,
    trackTime: staffCanWrite,
    uploadAttachments: writable && holds(permissionKeys.ticketAttachmentsUpload),
    viewActivity: isStaff,
  };
}
