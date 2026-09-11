import type { AutoAssignStrategy, TicketStatus } from '../../../generated/prisma/enums';

export const autoAssignStrategies = [
  'NONE',
  'LEAST_BUSY',
  'ROUND_ROBIN',
] as const satisfies readonly AutoAssignStrategy[];

export const assignmentBusyTicketStatuses = [
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'PENDING_APPROVAL',
] as const satisfies readonly TicketStatus[];

export const claimableTicketStatuses = [
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
] as const satisfies readonly TicketStatus[];

export const globalAutoAssignStrategyValues = [
  'least_busy',
  'round_robin',
] as const;

export const defaultTicketAssignmentConfiguration = {
  groupInboxEnabled: true,
  autoAssignEnabled: false,
  autoAssignStrategy: 'LEAST_BUSY',
} as const satisfies {
  readonly groupInboxEnabled: boolean;
  readonly autoAssignEnabled: boolean;
  readonly autoAssignStrategy: Exclude<AutoAssignStrategy, 'NONE'>;
};

export const ticketAssignmentChangeLogReasons = {
  assign: 'ticket_assign',
  claim: 'ticket_claim',
} as const;
