import {
  permissionCategoryIds,
  type PermissionCategoryId,
} from './permission-categories';
import { permissionKeys } from './authorization.constants';

export type { PermissionCategoryId };
export { permissionCategoryIds };

export type PermissionCatalogEntry = {
  readonly key: string;
  readonly description: string;
  readonly categoryId: PermissionCategoryId;
};

const ticket = permissionCategoryIds.ticket;
const service = permissionCategoryIds.service;
const edge = permissionCategoryIds.edge;
const knowledge = permissionCategoryIds.knowledge;

export const permissionCatalogEntries: readonly PermissionCatalogEntry[] = [
  {
    key: permissionKeys.ticketForwardCrossOu,
    categoryId: ticket,
    description:
      'Forward a ticket to another organizational unit (OU-scoped and audited).',
  },
  {
    key: permissionKeys.ticketMerge,
    categoryId: ticket,
    description: 'Merge tickets into a parent ticket via bulk merge_into_parent.',
  },
  {
    key: permissionKeys.ticketBulkAssign,
    categoryId: ticket,
    description: 'Bulk-assign tickets to a group or user.',
  },
  {
    key: permissionKeys.ticketBulkStatusUpdate,
    categoryId: ticket,
    description:
      'Bulk-update ticket status (closing statuses may still be blocked).',
  },
  {
    key: permissionKeys.ticketBulkPriorityUpdate,
    categoryId: ticket,
    description: 'Bulk-update ticket priority.',
  },
  {
    key: permissionKeys.ticketBulkBroadcast,
    categoryId: ticket,
    description:
      'Send a structured broadcast message to multiple tickets at once.',
  },
  {
    key: permissionKeys.ticketAttachmentsUpload,
    categoryId: ticket,
    description: 'Upload or delete ticket attachments.',
  },
  {
    key: permissionKeys.ticketAttachmentsDownload,
    categoryId: ticket,
    description: 'List and download ticket attachments.',
  },
  {
    key: permissionKeys.serviceCatalogWrite,
    categoryId: service,
    description: 'Create and edit service catalog entries and onboarding steps.',
  },
  {
    key: permissionKeys.serviceFormsWrite,
    categoryId: service,
    description: 'Create and edit service request forms.',
  },
  {
    key: permissionKeys.serviceAvailabilityWrite,
    categoryId: service,
    description: 'Manage service availability windows and downtime.',
  },
  {
    key: permissionKeys.slaWrite,
    categoryId: permissionCategoryIds.sla,
    description:
      'Manage SLA calendars, profiles, rules, escalations, and the priority matrix.',
  },
  {
    key: permissionKeys.routingWrite,
    categoryId: permissionCategoryIds.routing,
    description: 'Create and edit ticket routing rules.',
  },
  {
    key: permissionKeys.groupManage,
    categoryId: permissionCategoryIds.group,
    description: 'Create, edit, and delete groups and manage group members.',
  },
  {
    key: permissionKeys.settingsWrite,
    categoryId: permissionCategoryIds.settings,
    description: 'Change system settings, policy packs, and config versions.',
  },
  {
    key: permissionKeys.integrationsQueueManage,
    categoryId: permissionCategoryIds.integrations,
    description: 'View and manage the integration job queue (retry, inspect).',
  },
  {
    key: permissionKeys.auditExport,
    categoryId: permissionCategoryIds.audit,
    description: 'Export audit log data (CSV/JSON) and related reports access.',
  },
  {
    key: permissionKeys.reportsExport,
    categoryId: permissionCategoryIds.reports,
    description: 'Access and export dashboard and KPI reports.',
  },
  {
    key: permissionKeys.supportBundleExport,
    categoryId: permissionCategoryIds.observability,
    description: 'Download a support diagnostics bundle for troubleshooting.',
  },
  {
    key: permissionKeys.confidentialBreakGlass,
    categoryId: permissionCategoryIds.confidential,
    description:
      'Break-glass access to confidential tickets (audited override).',
  },
  {
    key: permissionKeys.knowledgeArticleWrite,
    categoryId: knowledge,
    description: 'Create and edit knowledge base articles.',
  },
  {
    key: permissionKeys.knowledgeArticleReview,
    categoryId: knowledge,
    description: 'Review knowledge base articles awaiting approval.',
  },
  {
    key: permissionKeys.knowledgeArticlePublish,
    categoryId: knowledge,
    description: 'Publish knowledge base articles to end users.',
  },
  {
    key: permissionKeys.edgeConnect,
    categoryId: edge,
    description: 'Connect the Edge Extension client (bootstrap session).',
  },
  {
    key: permissionKeys.edgeNotifyReceive,
    categoryId: edge,
    description: 'Receive Edge Extension notifications and record receipts.',
  },
  {
    key: permissionKeys.ticketMessageSend,
    categoryId: edge,
    description: 'Send quick-reply chat messages from the Edge Extension.',
  },
  {
    key: permissionKeys.ticketRemoteOpenQuickAssist,
    categoryId: edge,
    description:
      'Acknowledge and open Quick Assist remote sessions from Edge.',
  },
];
