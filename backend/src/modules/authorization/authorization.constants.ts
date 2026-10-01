import { authenticationConstants } from '../authentication/authentication.constants';

export const authorizationRoleKeys = {
  user: 'USER',
  agent: 'AGENT',
  admin: 'ADMIN',
  superAdmin: authenticationConstants.superAdminRoleKey,
  /** Paket 3.2: manages assets (added next to USER, e.g. procurement). */
  assetManager: 'ASSET_MANAGER',
  /** Paket 3.3: resolves, closes and cancels problems across units (usually added to an agent). */
  problemManager: 'PROBLEM_MANAGER',
  /** Paket 3.4: runs changes across units and votes in its CAB groups (usually added to an agent). */
  changeManager: 'CHANGE_MANAGER',
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
  // Paket 2.9 (K1): portal categories.
  knowledgeCategoryManage: 'knowledge.category.manage',
  // Paket 3.2: CMDB.
  assetRead: 'asset.read',
  assetManage: 'asset.manage',
  assetImport: 'asset.import',
  assetLicenseManage: 'asset.license.manage',
  assetContractManage: 'asset.contract.manage',
  assetTypeManage: 'asset.type.manage',
  assetReportRead: 'asset.report.read',
  // Paket 3.3
  problemRead: 'problem.read',
  problemManage: 'problem.manage',
  /** Paket 3.3: report a problem (pick its problem group) and link tickets. */
  problemReport: 'problem.report',
  problemClose: 'problem.close',
  /** Paket 3.4: change management. */
  changeRead: 'change.read',
  changeRequest: 'change.request',
  changeManage: 'change.manage',
  changeApprove: 'change.approve',
  edgeConnect: 'edge.connect',
  edgeNotifyReceive: 'edge.notify.receive',
  ticketMessageSend: 'ticket.message.send',
  ticketRemoteOpenQuickAssist: 'ticket.remote.open_quick_assist',
} as const;

/**
 * Permissions that a unit- or service-scoped assignment may satisfy on routes
 * without an OU/service scope requirement. Only for permissions whose data is
 * either shared by design or filtered by the service itself; everything else
 * stays fail-closed (a scoped grant never satisfies a global check).
 * - oncall.read: the on-call calendar is shared across groups by design
 *   (Paket 2.9 K3); agents are normally scoped to their unit.
 */
export const scopeAgnosticPermissionKeys: readonly string[] = [permissionKeys.onCallRead];

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
  permissionKeys.assetRead,
  permissionKeys.assetManage,
  // Paket 3.3 (decision 2026-10-01): agents report problems and link tickets;
  // the problem group (PROBLEM_MANAGER) runs the analysis and resolves.
  permissionKeys.problemRead,
  permissionKeys.problemReport,
  // Paket 3.4: agents read and request changes; CHANGE_MANAGER runs them.
  permissionKeys.changeRead,
  permissionKeys.changeRequest,
] as const;

const changeManagerPermissionKeys = [
  permissionKeys.changeRead,
  permissionKeys.changeRequest,
  permissionKeys.changeManage,
  permissionKeys.changeApprove,
] as const;

const problemManagerPermissionKeys = [
  permissionKeys.problemRead,
  permissionKeys.problemReport,
  permissionKeys.problemManage,
  permissionKeys.problemClose,
] as const;

const assetManagerPermissionKeys = [
  permissionKeys.assetRead,
  permissionKeys.assetManage,
  permissionKeys.assetImport,
  permissionKeys.assetLicenseManage,
  permissionKeys.assetContractManage,
  permissionKeys.assetReportRead,
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
  permissionKeys.knowledgeCategoryManage,
  permissionKeys.onCallManage,
  permissionKeys.announcementManage,
  permissionKeys.announcementReportRead,
  permissionKeys.assetImport,
  permissionKeys.assetLicenseManage,
  permissionKeys.assetContractManage,
  permissionKeys.assetTypeManage,
  permissionKeys.assetReportRead,
  permissionKeys.problemManage,
  permissionKeys.problemClose,
  permissionKeys.changeManage,
  permissionKeys.changeApprove,
] as const;

export const defaultRolePermissionKeys: Readonly<Record<string, readonly string[]>> =
  {
    [authorizationRoleKeys.user]: edgeClientPermissionKeys,
    [authorizationRoleKeys.agent]: agentPermissionKeys,
    [authorizationRoleKeys.admin]: adminPermissionKeys,
    [authorizationRoleKeys.assetManager]: assetManagerPermissionKeys,
    [authorizationRoleKeys.problemManager]: problemManagerPermissionKeys,
    [authorizationRoleKeys.changeManager]: changeManagerPermissionKeys,
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
