import type { MessageType } from '../../generated/prisma/enums';
import { ticketSystemEventActions } from './collaboration.constants';
import type { TicketRealtimeChange } from './ticket-realtime.types';

const publicChangeByAction: Readonly<Record<string, TicketRealtimeChange>> = {
  [ticketSystemEventActions.created]: 'updated',
  [ticketSystemEventActions.claimed]: 'assignment',
  [ticketSystemEventActions.assigned]: 'assignment',
  [ticketSystemEventActions.ticketBulkAssign]: 'assignment',
  [ticketSystemEventActions.forwarded]: 'assignment',
  [ticketSystemEventActions.ticketBulkPriority]: 'priority',
  [ticketSystemEventActions.ticketBulkStatus]: 'status',
  [ticketSystemEventActions.waitingForUserEntered]: 'status',
  [ticketSystemEventActions.waitingForUserResumed]: 'status',
  [ticketSystemEventActions.waitingForUserReminder]: 'status',
  [ticketSystemEventActions.waitingForUserAutoClosed]: 'closed',
  [ticketSystemEventActions.resolved]: 'resolved',
  [ticketSystemEventActions.closed]: 'closed',
  [ticketSystemEventActions.ticketArchived]: 'archived',
  [ticketSystemEventActions.ticketReopened]: 'reopened',
  [ticketSystemEventActions.ticketReopenedNew]: 'reopened',
  [ticketSystemEventActions.ticketSplit]: 'updated',
  [ticketSystemEventActions.ticketSplitChild]: 'updated',
  [ticketSystemEventActions.ticketBulkMerge]: 'updated',
  [ticketSystemEventActions.approvalRequested]: 'approval',
  [ticketSystemEventActions.approvalApproved]: 'approval',
  [ticketSystemEventActions.approvalRejected]: 'approval',
  [ticketSystemEventActions.slaResponseBreached]: 'sla',
  [ticketSystemEventActions.slaResolutionBreached]: 'sla',
  [ticketSystemEventActions.slaResponseAtRisk]: 'sla',
  [ticketSystemEventActions.slaResolutionAtRisk]: 'sla',
  [ticketSystemEventActions.slaResponseEscalated]: 'sla',
  [ticketSystemEventActions.slaResolutionEscalated]: 'sla',
};

const staffOnlyActions = new Set<string>([
  ticketSystemEventActions.participantAdded,
  ticketSystemEventActions.participantRemoved,
  ticketSystemEventActions.timeStarted,
  ticketSystemEventActions.timeStopped,
  ticketSystemEventActions.attachmentUploaded,
  ticketSystemEventActions.attachmentDeleted,
  ticketSystemEventActions.confidentialViewed,
  ticketSystemEventActions.confidentialDenied,
  ticketSystemEventActions.confidentialBreakGlass,
  ticketSystemEventActions.redactionWarned,
  ticketSystemEventActions.guardrailDuplicateWarned,
  ticketSystemEventActions.guardrailLoopSuppressed,
  ticketSystemEventActions.csatSubmitted,
]);

export function mapTicketRealtimeChange(
  messageType: MessageType,
  sourceAction: string | null,
): TicketRealtimeChange | null {
  if (messageType === 'APPROVAL_DECISION') {
    return 'approval';
  }
  if (messageType !== 'SYSTEM_EVENT' || sourceAction === null) {
    return null;
  }
  const mapped = publicChangeByAction[baseAction(sourceAction)];
  if (mapped !== undefined) {
    return mapped;
  }
  return 'updated';
}

// System event bodies are `action` or `action:detail`.
function baseAction(sourceAction: string): string {
  const separator = sourceAction.indexOf(':');
  return separator === -1 ? sourceAction : sourceAction.slice(0, separator);
}

export function isStaffOnlyTicketRealtimeAction(sourceAction: string | null): boolean {
  return sourceAction !== null && staffOnlyActions.has(baseAction(sourceAction));
}
