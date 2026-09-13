export const emailTemplateKeys = [
  "ticket.created",
  "ticket.assigned",
  "ticket.message",
  "ticket.resolved",
  "ticket.closed",
  "ticket.approval",
  "ticket.sla",
  "remote.requested",
] as const;

export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

export const emailTemplatePlaceholders = [
  "ticketNumber",
  "ticketTitle",
  "ticketId",
  "type",
  "event",
] as const;

export type EmailTemplateDefinition = {
  readonly subject: string;
  readonly body: string;
};

export type EmailTemplateRegistry = Record<EmailTemplateKey, EmailTemplateDefinition>;

export const emailTemplateLabelKeys = {
  "ticket.created": "settings.email.templates.ticketCreated",
  "ticket.assigned": "settings.email.templates.ticketAssigned",
  "ticket.message": "settings.email.templates.ticketMessage",
  "ticket.resolved": "settings.email.templates.ticketResolved",
  "ticket.closed": "settings.email.templates.ticketClosed",
  "ticket.approval": "settings.email.templates.ticketApproval",
  "ticket.sla": "settings.email.templates.ticketSla",
  "remote.requested": "settings.email.templates.remoteRequested",
} as const;
