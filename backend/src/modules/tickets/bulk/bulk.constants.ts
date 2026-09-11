import { ticketBulkActionTypes } from './bulk.types';
import type { TicketBulkConfiguration } from './bulk.types';

export const defaultTicketBulkConfiguration: TicketBulkConfiguration = {
  enabled: true,
  allowCrossOuForSuperAdmin: true,
  requireSameOuAndGroup: true,
  disallowBulkClose: true,
  allowedActionTypes: ticketBulkActionTypes,
  broadcastEnableInApp: true,
  broadcastEnableEmail: true,
  broadcastRequirePreview: true,
  broadcastRateLimitPerMinute: 10,
  broadcastStructuredEnabled: true,
  broadcastRequiredFields: ['what_happened', 'who_affected', 'eta'],
  broadcastAllowWorkaround: true,
  broadcastAllowLinks: true,
  auditBatchIdEnabled: true,
};

export const ticketBulkConstants = {
  maximumTicketIds: 100,
  maximumReasonLength: 2000,
  maximumBroadcastFieldLength: 2000,
} as const;

export const closedBulkStatuses = ['CLOSED', 'ARCHIVED'] as const;
