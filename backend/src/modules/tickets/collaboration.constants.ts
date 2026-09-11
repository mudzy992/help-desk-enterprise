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
