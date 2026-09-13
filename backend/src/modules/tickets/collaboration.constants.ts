import type {
  MessageType,
  ParticipantRole,
} from '../../generated/prisma/enums';

export const participantRoles = [
  'REQUESTER',
  'ASSIGNEE',
  'HANDLER_GROUP',
  'APPROVER',
  'FORWARDED_FROM_GROUP',
  'FORWARDED_TO_GROUP',
  'WATCHER',
  'SYSTEM',
] as const satisfies readonly ParticipantRole[];

export const messageTypes = [
  'USER_REPLY',
  'AGENT_REPLY',
  'INTERNAL_NOTE',
  'SYSTEM_EVENT',
  'APPROVAL_DECISION',
] as const satisfies readonly MessageType[];

export const publicMessageTypes = [
  'USER_REPLY',
  'AGENT_REPLY',
] as const satisfies readonly MessageType[];

export const staffOnlyMessageTypes = [
  'INTERNAL_NOTE',
  'SYSTEM_EVENT',
  'APPROVAL_DECISION',
] as const satisfies readonly MessageType[];

export const clientCreatableMessageTypes = [
  'USER_REPLY',
  'AGENT_REPLY',
  'INTERNAL_NOTE',
] as const satisfies readonly MessageType[];

export const manuallyAssignableParticipantRoles = [
  'WATCHER',
  'APPROVER',
  'FORWARDED_FROM_GROUP',
  'FORWARDED_TO_GROUP',
] as const satisfies readonly ParticipantRole[];

export const defaultParticipantRolesOnCreate = [
  'REQUESTER',
  'HANDLER_GROUP',
] as const satisfies readonly ParticipantRole[];

export const ticketSystemEventActions = {
  created: 'ticket_created',
  claimed: 'ticket_claimed',
  assigned: 'ticket_assigned',
  participantAdded: 'ticket_participant_added',
  participantRemoved: 'ticket_participant_removed',
  timeStarted: 'ticket_time_started',
  timeStopped: 'ticket_time_stopped',
  attachmentUploaded: 'ticket_attachment_uploaded',
  attachmentDeleted: 'ticket_attachment_deleted',
  approvalRequested: 'ticket_approval_requested',
  approvalApproved: 'ticket_approval_approved',
  approvalRejected: 'ticket_approval_rejected',
  resolved: 'ticket_resolved',
  closed: 'ticket_closed',
  waitingForUserEntered: 'ticket_waiting_for_user_entered',
  waitingForUserResumed: 'ticket_waiting_for_user_resumed',
  waitingForUserReminder: 'ticket_waiting_for_user_reminder',
  waitingForUserAutoClosed: 'ticket_waiting_for_user_auto_closed',
  ticketReopened: 'ticket_reopened',
  ticketReopenedNew: 'ticket_reopened_new',
  ticketSplit: 'ticket_split',
  ticketSplitChild: 'ticket_split_child',
  ticketBulkAssign: 'ticket_bulk_assign',
  ticketBulkStatus: 'ticket_bulk_status',
  ticketBulkPriority: 'ticket_bulk_priority',
  ticketBulkBroadcast: 'ticket_bulk_broadcast',
  ticketBulkMerge: 'ticket_bulk_merge',
  redactionWarned: 'ticket_redaction_warned',
  confidentialViewed: 'ticket_confidential_viewed',
  confidentialDenied: 'ticket_confidential_denied',
  confidentialBreakGlass: 'ticket_confidential_break_glass',
  guardrailDuplicateWarned: 'ticket_guardrail_duplicate_warned',
  guardrailLoopSuppressed: 'ticket_guardrail_loop_suppressed',
  csatSubmitted: 'ticket_csat_submitted',
  ticketArchived: 'ticket_archived',
  slaResponseBreached: 'ticket_sla_response_breached',
  slaResolutionBreached: 'ticket_sla_resolution_breached',
  slaResponseEscalated: 'ticket_sla_response_escalated',
  slaResolutionEscalated: 'ticket_sla_resolution_escalated',
} as const;

export const ticketRealtimeEventNames = {
  messageCreated: 'ticket.message.created',
  join: 'ticket:join',
  leave: 'ticket:leave',
  error: 'ticket:error',
} as const;

export const defaultTicketCollaborationConfiguration = {
  participantsEnabled: true,
  defaultParticipantRoles: defaultParticipantRolesOnCreate,
  messageTypesEnabled: true,
  allowedMessageTypes: messageTypes,
} as const;
