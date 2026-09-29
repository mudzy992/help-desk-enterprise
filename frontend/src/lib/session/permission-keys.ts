/// Mirrors backend permissionKeys. The backend stays authoritative; these keys
/// only decide whether an action is rendered.
export const permissionKeys = {
  serviceFormsWrite: "service.forms.write",
  serviceCatalogWrite: "service.catalog.write",
  serviceAvailabilityWrite: "service.availability.write",
  routingWrite: "routing.write",
  groupManage: "group.manage",
  slaWrite: "sla.write",
  settingsWrite: "settings.write",
  configVersionImport: "config.version.import",
  integrationsQueueManage: "integrations.queue.manage",
  knowledgeArticleWrite: "knowledge.article.write",
  knowledgeArticleReview: "knowledge.article.review",
  knowledgeArticlePublish: "knowledge.article.publish",
  knowledgeCategoryManage: "knowledge.category.manage",
  confidentialBreakGlass: "confidential.break_glass",
  ticketBulkAssign: "ticket.bulk.assign",
  ticketMerge: "ticket.merge",
  ticketPriorityOverride: "ticket.priority.override",
  ticketTimeManage: "ticket.time.manage",
  ticketLinkManage: "ticket.link.manage",
  ticketTemplatesUse: "ticket.templates.use",
  ticketTemplatesPersonal: "ticket.templates.personal",
  ticketTemplatesManage: "ticket.templates.manage",
  ticketAttachmentsUpload: "ticket.attachments.upload",
  auditExport: "audit.export",
  reportsExport: "reports.export",
  reportsScheduleManage: "reports.schedule.manage",
  privacyView: "privacy.view",
  privacyManage: "privacy.manage",
  privacyAnonymize: "privacy.anonymize",
  opsHealthView: "ops.health.view",
  opsAlertsManage: "ops.alerts.manage",
  opsAlertsReceive: "ops.alerts.receive",
  statusIncidentsManage: "status.incidents.manage",
  onCallRead: "oncall.read",
  onCallManage: "oncall.manage",
} as const;

export type PermissionKey = (typeof permissionKeys)[keyof typeof permissionKeys];

export const roleKeys = {
  user: "USER",
  agent: "AGENT",
  admin: "ADMIN",
  superAdmin: "SUPER_ADMIN",
} as const;

export type RoleKey = (typeof roleKeys)[keyof typeof roleKeys];
