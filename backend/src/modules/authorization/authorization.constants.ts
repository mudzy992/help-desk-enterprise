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
  supportBundleExport: 'supportBundle.export',
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
] as const;

const adminPermissionKeys = [
  ...agentPermissionKeys,
  permissionKeys.ticketBulkPriorityUpdate,
  permissionKeys.ticketBulkBroadcast,
  permissionKeys.ticketTimeManage,
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
  permissionKeys.supportBundleExport,
  permissionKeys.knowledgeArticleReview,
  permissionKeys.knowledgeArticlePublish,
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
