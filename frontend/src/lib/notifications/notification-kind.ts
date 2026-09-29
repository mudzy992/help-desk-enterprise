export type NotificationKind = "ticket" | "sla" | "approval" | "system";

const KIND_BY_TYPE: Readonly<Record<string, NotificationKind>> = {
  "ticket.created": "ticket",
  "ticket.assigned": "ticket",
  "ticket.forwarded": "ticket",
  "ticket.message": "ticket",
  "ticket.mentioned": "ticket",
  "ticket.resolved": "ticket",
  "ticket.closed": "ticket",
  "ticket.approval": "approval",
  "ticket.sla": "sla",
  "remote.requested": "ticket",
  "ticket.timeAutoStopped": "ticket",
  "ticket.unroutedOverdue": "ticket",
};

export function notificationKind(type: string): NotificationKind {
  return KIND_BY_TYPE[type] ?? "system";
}

export function notificationTicketPath(
  ticketId: string | null | undefined,
  type?: string,
): string | null {
  // Paket 1.7 (U2): the weekly digest points at the overdue list, not a ticket.
  if (type === "ticket.unroutedDigest") {
    return "/tickets?view=all&unroutedOverdue=true";
  }
  // Paket 1.8 (A3): the aborted directory sync points at the sync panel.
  if (type === "directory.syncAborted") {
    return "/organizational-units";
  }
  // Paket 2.3: a failing inbound mailbox opens its status panel.
  if (type === "inbound.mailboxFailing") {
    return "/settings";
  }
  // Paket 2.6: a data subject request deadline opens the privacy register.
  if (type === "privacy.requestDue") {
    return "/privacy";
  }
  // Paket 2.7: an operational alarm opens System health; incidents the status page.
  if (type === "ops.alert") {
    return "/admin?tab=ops";
  }
  if (type === "status.incidentStarted" || type === "status.incidentResolved") {
    return "/status";
  }
  // Paket 2.9 (K3): every on-call notification opens the on-call page.
  if (type?.startsWith("oncall.")) {
    return "/on-call";
  }
  // Paket 2.1: account security events open the own security page.
  if (type?.startsWith("account.")) {
    return "/account/security";
  }
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
  | "notifications.items.ticketMentioned"
  | "notifications.items.ticketResolved"
  | "notifications.items.ticketClosed"
  | "notifications.items.ticketApproval"
  | "notifications.items.ticketSla"
  | "notifications.items.remoteRequested"
  | "notifications.items.ticketTimeAutoStopped"
  | "notifications.items.ticketUnroutedOverdue"
  | "notifications.items.ticketUnroutedDigest"
  | "notifications.items.directorySyncAborted"
  | "notifications.items.accountMfaChanged"
  | "notifications.items.accountRecoveryCodeUsed"
  | "notifications.items.accountPasswordChanged"
  | "notifications.items.accountNewDevice"
  | "notifications.items.inboundMailboxFailing"
  | "notifications.items.privacyRequestDue"
  | "notifications.items.opsAlert"
  | "notifications.items.statusIncidentStarted"
  | "notifications.items.statusIncidentResolved"
  | "notifications.items.onCallReminder"
  | "notifications.items.onCallShiftStarted"
  | "notifications.items.onCallSwap"
  | "notifications.items.onCallGap"
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
    case "ticket.mentioned":
      return "notifications.items.ticketMentioned";
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
    case "ticket.timeAutoStopped":
      return "notifications.items.ticketTimeAutoStopped";
    case "ticket.unroutedOverdue":
      return "notifications.items.ticketUnroutedOverdue";
    case "ticket.unroutedDigest":
      return "notifications.items.ticketUnroutedDigest";
    case "directory.syncAborted":
      return "notifications.items.directorySyncAborted";
    case "account.mfaChanged":
      return "notifications.items.accountMfaChanged";
    case "account.recoveryCodeUsed":
      return "notifications.items.accountRecoveryCodeUsed";
    case "account.passwordChanged":
      return "notifications.items.accountPasswordChanged";
    case "account.newDevice":
      return "notifications.items.accountNewDevice";
    case "inbound.mailboxFailing":
      return "notifications.items.inboundMailboxFailing";
    case "privacy.requestDue":
      return "notifications.items.privacyRequestDue";
    case "ops.alert":
      return "notifications.items.opsAlert";
    case "status.incidentStarted":
      return "notifications.items.statusIncidentStarted";
    case "status.incidentResolved":
      return "notifications.items.statusIncidentResolved";
    case "oncall.reminder":
      return "notifications.items.onCallReminder";
    case "oncall.shiftStarted":
      return "notifications.items.onCallShiftStarted";
    case "oncall.swap":
      return "notifications.items.onCallSwap";
    case "oncall.gap":
      return "notifications.items.onCallGap";
    default:
      return "notifications.items.unknown";
  }
}
