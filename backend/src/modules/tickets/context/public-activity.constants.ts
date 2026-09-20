import { ticketSystemEventActions } from '../collaboration.constants';

/**
 * System events a requester may see on their own ticket. Everything else
 * (participants, time tracking, SLA, bulk operations, approvals, attachments,
 * guardrails, confidential access, redaction warnings) is internal work and
 * stays staff-only.
 */
export const publicTicketSystemEventActions: ReadonlySet<string> = new Set<string>([
  ticketSystemEventActions.created,
  ticketSystemEventActions.assigned,
  ticketSystemEventActions.claimed,
  ticketSystemEventActions.resolved,
  ticketSystemEventActions.closed,
  ticketSystemEventActions.waitingForUserEntered,
  ticketSystemEventActions.waitingForUserResumed,
  ticketSystemEventActions.waitingForUserReminder,
  ticketSystemEventActions.waitingForUserAutoClosed,
  ticketSystemEventActions.ticketReopened,
  ticketSystemEventActions.ticketReopenedNew,
  ticketSystemEventActions.ticketSplit,
  ticketSystemEventActions.ticketSplitChild,
  ticketSystemEventActions.csatSubmitted,
  ticketSystemEventActions.ticketArchived,
  ticketSystemEventActions.remoteRequested,
  ticketSystemEventActions.remoteAcknowledged,
]);

/** System event bodies are `action` or `action:detail`. */
export function parseSystemEventBody(body: string): {
  readonly action: string;
  readonly detail: string | null;
} {
  const separator = body.indexOf(':');
  if (separator === -1) {
    return { action: body.trim(), detail: null };
  }
  const detail = body.slice(separator + 1).trim();
  return {
    action: body.slice(0, separator).trim(),
    detail: detail.length > 0 ? detail : null,
  };
}

/** Actions whose detail is the id of the user the action was directed at. */
export function readSystemEventTargetUserId(body: string): string | null {
  const { action, detail } = parseSystemEventBody(body);
  return action === ticketSystemEventActions.assigned ? detail : null;
}
