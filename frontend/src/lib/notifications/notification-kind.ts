export type NotificationKind = "ticket" | "sla" | "approval" | "system";

const KIND_BY_TYPE: Readonly<Record<string, NotificationKind>> = {
  "ticket.created": "ticket",
  "ticket.assigned": "ticket",
  "ticket.forwarded": "ticket",
  "ticket.message": "ticket",
  "ticket.resolved": "ticket",
  "ticket.closed": "ticket",
  "ticket.approval": "approval",
  "ticket.sla": "sla",
  "remote.requested": "ticket",
};

export function notificationKind(type: string): NotificationKind {
  return KIND_BY_TYPE[type] ?? "system";
}

export function notificationTicketPath(
  ticketId: string | null | undefined,
  type?: string,
): string | null {
  if (ticketId === undefined || ticketId === null || ticketId.length === 0) {
    return null;
  }
  switch (notificationKind(type ?? "")) {
    case "ticket":
    case "sla":
    case "approval":
    case "system":
      return `/tickets/${ticketId}`;
  }
}

export function notificationTitleKey(
  type: string,
):
  | "notifications.items.ticketCreated"
  | "notifications.items.ticketAssigned"
  | "notifications.items.ticketForwarded"
  | "notifications.items.ticketMessage"
  | "notifications.items.ticketResolved"
  | "notifications.items.ticketClosed"
  | "notifications.items.ticketApproval"
  | "notifications.items.ticketSla"
  | "notifications.items.remoteRequested"
  | "notifications.items.unknown" {
  switch (type) {
    case "ticket.created":
      return "notifications.items.ticketCreated";
    case "ticket.assigned":
      return "notifications.items.ticketAssigned";
    case "ticket.forwarded":
      return "notifications.items.ticketForwarded";
    case "ticket.message":
      return "notifications.items.ticketMessage";
    case "ticket.resolved":
      return "notifications.items.ticketResolved";
    case "ticket.closed":
      return "notifications.items.ticketClosed";
    case "ticket.approval":
      return "notifications.items.ticketApproval";
    case "ticket.sla":
      return "notifications.items.ticketSla";
    case "remote.requested":
      return "notifications.items.remoteRequested";
    default:
      return "notifications.items.unknown";
  }
}
