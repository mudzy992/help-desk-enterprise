/// Mirrors backend permissionKeys. The backend stays authoritative; these keys
/// only decide whether an action is rendered.
export const permissionKeys = {
  serviceFormsWrite: "service.forms.write",
  serviceCatalogWrite: "service.catalog.write",
  routingWrite: "routing.write",
  slaWrite: "sla.write",
  settingsWrite: "settings.write",
  integrationsQueueManage: "integrations.queue.manage",
  knowledgeArticleWrite: "knowledge.article.write",
  knowledgeArticleReview: "knowledge.article.review",
  knowledgeArticlePublish: "knowledge.article.publish",
  confidentialBreakGlass: "confidential.break_glass",
  ticketBulkAssign: "ticket.bulk.assign",
  ticketAttachmentsUpload: "ticket.attachments.upload",
} as const;

export type PermissionKey = (typeof permissionKeys)[keyof typeof permissionKeys];

export const roleKeys = {
  user: "USER",
  agent: "AGENT",
  admin: "ADMIN",
  superAdmin: "SUPER_ADMIN",
} as const;

export type RoleKey = (typeof roleKeys)[keyof typeof roleKeys];
