import type { TicketPriority, TicketStatus } from '../../../generated/prisma/enums';
import type { TicketResponse } from '../tickets.types';

export const ticketBulkActionTypes = [
  'assign_group',
  'assign_user',
  'set_status',
  'set_priority',
  'broadcast_message',
  'merge_into_parent',
] as const;

export type TicketBulkActionType = (typeof ticketBulkActionTypes)[number];

export const ticketBulkBroadcastFields = [
  'what_happened',
  'who_affected',
  'eta',
] as const;

export type TicketBulkBroadcastField =
  (typeof ticketBulkBroadcastFields)[number];

export type TicketBulkConfiguration = {
  readonly enabled: boolean;
  readonly allowCrossOuForSuperAdmin: boolean;
  readonly requireSameOuAndGroup: boolean;
  readonly disallowBulkClose: boolean;
  readonly allowedActionTypes: readonly TicketBulkActionType[];
  readonly broadcastEnableInApp: boolean;
  readonly broadcastEnableEmail: boolean;
  readonly broadcastRequirePreview: boolean;
  readonly broadcastRateLimitPerMinute: number;
  readonly broadcastStructuredEnabled: boolean;
  readonly broadcastRequiredFields: readonly string[];
  readonly broadcastAllowWorkaround: boolean;
  readonly broadcastAllowLinks: boolean;
  readonly auditBatchIdEnabled: boolean;
};

export type ExecuteTicketBulkInput = {
  readonly ticketIds: readonly string[];
  readonly actionType: TicketBulkActionType;
  readonly assignedGroupId?: string;
  readonly assignedUserId?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly reason?: string;
  readonly parentTicketId?: string;
  readonly previewConfirmed?: boolean;
  readonly broadcastConfirmed?: boolean;
  readonly whatHappened?: string;
  readonly whoAffected?: string;
  readonly eta?: string;
  readonly workaround?: string;
};

export type TicketBulkPreview = {
  readonly ticketCount: number;
  readonly recipientCount: number;
  readonly emailRequested: boolean;
  readonly requiresConfirmation: boolean;
  readonly requiresBroadcastConfirmation: boolean;
};

export type TicketBulkResult = {
  readonly batchId: string | null;
  readonly actionType: TicketBulkActionType;
  readonly tickets: readonly TicketResponse[];
  readonly recipientCount?: number;
};
