import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

export type TicketActivityKind =
  | "status"
  | "assign"
  | "approval"
  | "sla"
  | "routing"
  | "security"
  | "edit";

/**
 * Every action the backend writes as a SYSTEM_EVENT message body
 * (`ticketSystemEventActions`), grouped by the kind that drives the icon.
 */
export const ticketSystemEventKinds: Readonly<Record<string, TicketActivityKind>> = {
  ticket_created: "status",
  ticket_claimed: "assign",
  ticket_assigned: "assign",
  ticket_participant_added: "assign",
  ticket_participant_removed: "assign",
  ticket_time_started: "assign",
  ticket_time_stopped: "assign",
  ticket_attachment_uploaded: "edit",
  ticket_attachment_deleted: "edit",
  ticket_approval_requested: "approval",
  ticket_approval_approved: "approval",
  ticket_approval_rejected: "approval",
  ticket_resolved: "status",
  ticket_closed: "status",
  ticket_waiting_for_user_entered: "status",
  ticket_waiting_for_user_resumed: "status",
  ticket_waiting_for_user_reminder: "status",
  ticket_waiting_for_user_auto_closed: "status",
  ticket_reopened: "status",
  ticket_reopened_new: "status",
  ticket_split: "routing",
  ticket_split_child: "routing",
  ticket_bulk_assign: "assign",
  ticket_bulk_status: "edit",
  ticket_bulk_priority: "edit",
  ticket_bulk_broadcast: "edit",
  ticket_bulk_merge: "routing",
  ticket_redaction_warned: "security",
  ticket_confidential_viewed: "security",
  ticket_confidential_denied: "security",
  ticket_confidential_break_glass: "security",
  ticket_guardrail_duplicate_warned: "security",
  ticket_guardrail_loop_suppressed: "security",
  ticket_csat_submitted: "status",
  ticket_archived: "status",
  ticket_sla_response_breached: "sla",
  ticket_sla_resolution_breached: "sla",
  ticket_sla_response_at_risk: "sla",
  ticket_sla_resolution_at_risk: "sla",
  ticket_sla_response_escalated: "sla",
  ticket_sla_resolution_escalated: "sla",
  ticket_remote_requested: "edit",
  ticket_remote_acknowledged: "edit",
};

/** System event bodies are `action` or `action:detail`. */
export function parseSystemEventBody(body: string): {
  readonly action: string;
  readonly detail: string | null;
} {
  const separator = body.indexOf(":");
  if (separator === -1) {
    return { action: body.trim(), detail: null };
  }
  return {
    action: body.slice(0, separator).trim(),
    detail: body.slice(separator + 1).trim() || null,
  };
}

export function isKnownSystemEvent(action: string): boolean {
  return Object.prototype.hasOwnProperty.call(ticketSystemEventKinds, action);
}

export function systemEventKind(action: string): TicketActivityKind {
  return isKnownSystemEvent(action) ? ticketSystemEventKinds[action] : "edit";
}

/** i18n key for the event text; unknown actions never expose the raw key. */
export function systemEventTextKey(action: string): string {
  return isKnownSystemEvent(action)
    ? `tickets.activity.events.${action}`
    : "tickets.activity.unknownEvent";
}

export function isActivityMessage(message: TicketMessageResponse): boolean {
  return message.type === "SYSTEM_EVENT" || message.type === "APPROVAL_DECISION";
}

export function messageActivityKind(message: TicketMessageResponse): TicketActivityKind {
  return message.type === "APPROVAL_DECISION"
    ? "approval"
    : systemEventKind(parseSystemEventBody(message.body).action);
}
