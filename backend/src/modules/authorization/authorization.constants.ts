import { authenticationConstants } from '../authentication/authentication.constants';

export const authorizationRoleKeys = {
  user: 'USER',
  agent: 'AGENT',
  admin: 'ADMIN',
  superAdmin: authenticationConstants.superAdminRoleKey,
} as const;

export const permissionKeys = {
  ticketForwardCrossOu: 'ticket.forward.cross_ou',
  ticketMerge: 'ticket.merge',
  ticketPriorityOverride: 'ticket.priority.override',
  ticketTimeManage: 'ticket.time.manage',
  ticketLinkManage: 'ticket.link.manage',
  ticketTemplatesUse: 'ticket.templates.use',
  ticketTemplatesPersonal: 'ticket.templates.personal',
  ticketTemplatesManage: 'ticket.templates.manage',
  ticketBulkAssign: 'ticket.bulk.assign',
  ticketBulkStatusUpdate: 'ticket.bulk.status_update',
  ticketBulkPriorityUpdate: 'ticket.bulk.priority_update',
  ticketBulkBroadcast: 'ticket.bulk.broadcast',
  ticketAttachmentsUpload: 'ticket.attachments.upload',
  ticketAttachmentsDownload: 'ticket.attachments.download',
  serviceCatalogWrite: 'service.catalog.write',
  serviceFormsWrite: 'service.forms.write',
  serviceAvailabilityWrite: 'service.availability.write',
  slaWrite: 'sla.write',
  routingWrite: 'routing.write',
  groupManage: 'group.manage',
  settingsWrite: 'settings.write',
  integrationsQueueManage: 'integrations.queue.manage',
  auditExport: 'audit.export',
  reportsExport: 'reports.export',
  reportsScheduleManage: 'reports.schedule.manage',
  // Paket 2.6 (§9): zaštita ličnih podataka.
  privacyView: 'privacy.view',
  privacyManage: 'privacy.manage',
  privacyAnonymize: 'privacy.anonymize',
  supportBundleExport: 'supportBundle.export',
  // Paket 2.7 (§9): pouzdanost i monitoring.
  opsHealthView: 'ops.health.view',
  opsAlertsManage: 'ops.alerts.manage',
  opsAlertsReceive: 'ops.alerts.receive',
  statusIncidentsManage: 'status.incidents.manage',
  // Paket 2.9 (K4): importing a config package from another environment.
  configVersionImport: 'config.version.import',
  // Paket 2.9 (K3): on-call schedules.
  onCallRead: 'oncall.read',
  onCallManage: 'oncall.manage',
  // Paket 2.9 (K2): announcements.
  announcementManage: 'announcement.manage',
  announcementReportRead: 'announcement.report.read',
  confidentialBreakGlass: 'confidential.break_glass',
  knowledgeArticleWrite: 'knowledge.article.write',
  knowledgeArticleReview: 'knowledge.article.review',
  knowledgeArticlePublish: 'knowledge.article.publish',
  edgeConnect: 'edge.connect',
  edgeNotifyReceive: 'edge.notify.receive',
  ticketMessageSend: 'ticket.message.send',
  ticketRemoteOpenQuickAssist: 'ticket.remote.open_quick_assist',
} as const;

export const allPermissionKeys: readonly string[] = Object.values(permissionKeys);

const edgeClientPermissionKeys = [
  permissionKeys.edgeConnect,
  permissionKeys.edgeNotifyReceive,
  permissionKeys.ticketMessageSend,
  permissionKeys.ticketRemoteOpenQuickAssist,
] as const;

const agentPermissionKeys = [
  ...edgeClientPermissionKeys,
  permissionKeys.ticketAttachmentsUpload,
  permissionKeys.ticketAttachmentsDownload,
  permissionKeys.ticketMerge,
  permissionKeys.ticketPriorityOverride,
  permissionKeys.ticketBulkAssign,
  permissionKeys.ticketBulkStatusUpdate,
  permissionKeys.ticketForwardCrossOu,
  permissionKeys.knowledgeArticleWrite,
  permissionKeys.ticketTemplatesUse,
  permissionKeys.ticketTemplatesPersonal,
  permissionKeys.ticketLinkManage,
  permissionKeys.onCallRead,
] as const;

const adminPermissionKeys = [
  ...agentPermissionKeys,
  permissionKeys.ticketBulkPriorityUpdate,
  permissionKeys.ticketBulkBroadcast,
  permissionKeys.ticketTimeManage,
  permissionKeys.ticketTemplatesManage,
  permissionKeys.routingWrite,
  permissionKeys.groupManage,
  permissionKeys.serviceCatalogWrite,
  permissionKeys.serviceFormsWrite,
  permissionKeys.serviceAvailabilityWrite,
  permissionKeys.slaWrite,
  permissionKeys.settingsWrite,
  permissionKeys.integrationsQueueManage,
  permissionKeys.auditExport,
  permissionKeys.reportsExport,
  permissionKeys.reportsScheduleManage,
  // Paket 2.6: ADMIN sees the register and retention reports; managing
  // requests/exports/retention and anonymizing stay with SUPER_ADMIN (RBAC can
  // grant `privacy.manage` to ADMIN explicitly).
  permissionKeys.privacyView,
  // Paket 2.7: ADMIN watches system health, receives alarms and runs incidents;
  // thresholds, recipients, silencing and the DLQ baseline stay with SUPER_ADMIN.
  permissionKeys.opsHealthView,
  permissionKeys.opsAlertsReceive,
  permissionKeys.statusIncidentsManage,
  permissionKeys.supportBundleExport,
  permissionKeys.knowledgeArticleReview,
  permissionKeys.knowledgeArticlePublish,
  permissionKeys.onCallManage,
  permissionKeys.announcementManage,
  permissionKeys.announcementReportRead,
] as const;

export const defaultRolePermissionKeys: Readonly<Record<string, readonly string[]>> =
  {
    [authorizationRoleKeys.user]: edgeClientPermissionKeys,
    [authorizationRoleKeys.agent]: agentPermissionKeys,
    [authorizationRoleKeys.admin]: adminPermissionKeys,
    [authorizationRoleKeys.superAdmin]: [
      ...allPermissionKeys,
    ],
  };

export const AUTHORIZATION_REQUIRED_ROLES_KEY = 'authorization:requiredRoles';
export const AUTHORIZATION_REQUIRED_PERMISSIONS_KEY =
  'authorization:requiredPermissions';
export const AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY =
  'authorization:organizationalUnitScope';
export const AUTHORIZATION_SERVICE_SCOPE_KEY = 'authorization:serviceScope';
