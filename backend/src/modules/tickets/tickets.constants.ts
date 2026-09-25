import type {
  TicketImpact,
  TicketPriority,
  TicketStatus,
  TicketUrgency,
} from '../../generated/prisma/enums';

export const ticketStatuses = [
  'PENDING',
  'UNROUTED',
  'PENDING_APPROVAL',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
] as const satisfies readonly TicketStatus[];

export const ticketImpactLevels = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const satisfies readonly TicketImpact[];

export const ticketUrgencyLevels = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const satisfies readonly TicketUrgency[];

export const ticketPriorityLevels = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const satisfies readonly TicketPriority[];

export const ticketSeverityRank: Readonly<Record<TicketImpact, number>> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export const allowedTicketStatusTransitions: Readonly<
  Record<TicketStatus, readonly TicketStatus[]>
> = {
  // Review 2026-09-25: CLOSED directly (duplicate / spam / withdrawn) — the
  // close-code and required-field rules still apply to the CLOSED target.
  PENDING: ['ASSIGNED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED'],
  UNROUTED: ['PENDING', 'CLOSED'],
  PENDING_APPROVAL: ['PENDING', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'PENDING', 'WAITING_FOR_USER', 'CLOSED'],
  IN_PROGRESS: ['WAITING_FOR_USER', 'RESOLVED', 'ASSIGNED'],
  WAITING_FOR_USER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['ARCHIVED', 'IN_PROGRESS'],
  ARCHIVED: [],
};

export const ticketConstants = {
  maximumTitleLength: 200,
  maximumDescriptionLength: 8000,
  maximumMessageBodyLength: 8000,
  ticketNumberPrefix: 'T-',
  ticketNumberPad: 6,
} as const;

export const ticketChangeLogReasons = {
  create: 'ticket_create',
  update: 'ticket_update',
  participantAdd: 'ticket_participant_add',
  participantRemove: 'ticket_participant_remove',
  timeStart: 'ticket_time_start',
  timeStop: 'ticket_time_stop',
  attachmentUpload: 'ticket_attachment_upload',
  attachmentDelete: 'ticket_attachment_delete',
  waitingReminder: 'ticket_waiting_for_user_reminder',
  waitingAutoClose: 'ticket_waiting_for_user_auto_close',
  reopen: 'ticket_reopened',
  reopenNew: 'ticket_reopened_new',
  split: 'ticket_split',
  bulkAssign: 'ticket_bulk_assign',
  forward: 'ticket_forward',
  bulkStatus: 'ticket_bulk_status',
  bulkPriority: 'ticket_bulk_priority',
  bulkBroadcast: 'ticket_bulk_broadcast',
  bulkMerge: 'ticket_bulk_merge',
  redactionWarned: 'ticket_redaction_warned',
  confidentialViewed: 'ticket_confidential_viewed',
  confidentialDenied: 'ticket_confidential_denied',
  confidentialBreakGlass: 'ticket_confidential_break_glass',
  guardrailDuplicate: 'ticket_guardrail_duplicate',
  guardrailLoopSuppressed: 'ticket_guardrail_loop_suppressed',
  csatSubmit: 'ticket_csat_submitted',
  archived: 'ticket_archived',
} as const;
