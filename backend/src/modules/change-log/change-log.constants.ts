export const changeLogEntityTypes = {
  setting: 'setting',
  routingRule: 'routing_rule',
  ticket: 'ticket',
  ticketParticipant: 'ticket_participant',
  ticketTimeLog: 'ticket_time_log',
  ticketAttachment: 'ticket_attachment',
  knowledgeArticle: 'knowledge_article',
} as const;

export const changeLogActions = {
  create: 'create',
  update: 'update',
  delete: 'delete',
} as const;

export const changeLogErrorCodes = {
  reasonRequired: 'REASON_REQUIRED',
} as const;

export const maximumChangeReasonLength = 512;
