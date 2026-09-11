import type { TicketStatus } from '../../generated/prisma/enums';
import type { TicketRecord } from './tickets.types';

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function applyTicketLifecycleTimestamps(input: {
  readonly current: TicketRecord;
  readonly nextStatus: TicketStatus;
  readonly now: Date;
}): Pick<
  TicketRecord,
  | 'resolvedAt'
  | 'closedAt'
  | 'archivedAt'
  | 'waitingForUserEnteredAt'
  | 'waitingForUserReminderSentAt'
> {
  const leavingWaiting =
    input.current.status === 'WAITING_FOR_USER' &&
    input.nextStatus !== 'WAITING_FOR_USER';
  const enteringWaiting =
    input.nextStatus === 'WAITING_FOR_USER' &&
    input.current.status !== 'WAITING_FOR_USER';
  const reopened =
    input.nextStatus === 'IN_PROGRESS' &&
    (input.current.status === 'RESOLVED' || input.current.status === 'CLOSED');
  return {
    resolvedAt: nextResolvedAt(input.current, input.nextStatus, input.now, reopened),
    closedAt: nextClosedAt(input.current, input.nextStatus, input.now, reopened),
    archivedAt:
      input.nextStatus === 'ARCHIVED'
        ? (input.current.archivedAt ?? input.now)
        : input.current.archivedAt,
    waitingForUserEnteredAt: enteringWaiting
      ? input.now
      : leavingWaiting
        ? null
        : input.current.waitingForUserEnteredAt,
    waitingForUserReminderSentAt: enteringWaiting || leavingWaiting
      ? null
      : input.current.waitingForUserReminderSentAt,
  };
}

export function daysToMilliseconds(days: number): number {
  return days * millisecondsPerDay;
}

function nextResolvedAt(
  current: TicketRecord,
  nextStatus: TicketStatus,
  now: Date,
  reopened: boolean,
): Date | null {
  if (reopened) {
    return null;
  }
  if (nextStatus === 'RESOLVED' || nextStatus === 'CLOSED') {
    return current.resolvedAt ?? now;
  }
  return current.resolvedAt;
}

function nextClosedAt(
  current: TicketRecord,
  nextStatus: TicketStatus,
  now: Date,
  reopened: boolean,
): Date | null {
  if (reopened) {
    return null;
  }
  if (nextStatus === 'CLOSED') {
    return current.closedAt ?? now;
  }
  return current.closedAt;
}
