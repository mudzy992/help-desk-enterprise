import { PrismaService } from '../../common/prisma/prisma.service';
import { applyDueSlaEscalations } from './apply-due-sla-escalations';
import { applyTicketSlaPause } from './apply-ticket-sla-pause';
import { applyTicketSlaResume } from './apply-ticket-sla-resume';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import {
  emitTicketSlaRuntimeEvents,
  emptyTicketSlaRuntimeMarks,
} from './emit-ticket-sla-runtime-events';
import { evaluateTicketSlaAtRisk } from './evaluate-ticket-sla-at-risk';
import { evaluateTicketSlaBreach } from './evaluate-ticket-sla-breach';
import {
  isSlaFirstResponseStatus,
  isSlaPauseStatus,
  isSlaTerminalStatus,
} from './is-sla-pause-status';
import { computeSlaNextDueAt } from './compute-sla-next-due-at';
import { loadBusinessHoursCalendar } from './load-business-hours-calendar';
import { loadSlaEscalationRules } from './load-sla-escalation-rules';
import {
  markTicketSlaResolutionCompleted,
  markTicketSlaResponded,
} from './mark-ticket-sla-completion';
import {
  loadTicketSlaState,
  persistTicketFirstResponseAt,
  persistTicketSlaState,
} from './persist-ticket-sla-state';
import { recomputeTicketSlaTargets } from './recompute-ticket-sla-targets';
import { startTicketSlaTimers } from './start-ticket-sla-timers';
import type { SyncTicketSlaTimersInput, TicketSlaStateRecord } from './ticket-sla.types';

export async function syncTicketSlaTimers(
  prisma: PrismaService,
  input: SyncTicketSlaTimersInput,
): Promise<TicketSlaStateRecord | null> {
  if (!input.configuration.enabled) {
    return null;
  }
  const now = input.now ?? new Date();
  const existing = await loadTicketSlaState(prisma, input.ticket.id);
  const previousMarks = existing ?? emptyTicketSlaRuntimeMarks;
  const started =
    existing ??
    (await startTicketSlaTimers(prisma, input.ticket, input.configuration, now));
  if (started === null) {
    return null;
  }
  const calendar = await loadCalendarForState(prisma, started);
  const state =
    input.event === 'priority_changed' && existing !== null
      ? await recomputeTicketSlaTargets(prisma, started, input.ticket, calendar)
      : started;
  const rules = await loadSlaEscalationRules(prisma, state.slaProfileId);
  const next = applyDueSlaEscalations(
    evaluateTicketSlaAtRisk(
      evaluateTicketSlaBreach(applyLifecycle(state, calendar, input, now), now),
      now,
      input.configuration.notifyBeforeOverdueMinutes,
    ),
    rules,
    calendar,
    input.configuration,
    now,
  );
  const persisted = await persistTicketSlaState(prisma, {
    ...next,
    // Phase 2.1: one column tells the scanner when to come back. Every write
    // path (ticket event, scan, creation) goes through here.
    nextDueAt: computeSlaNextDueAt({
      state: next,
      rules,
      calendar,
      configuration: input.configuration,
    }),
  });
  await emitTicketSlaRuntimeEvents(prisma, {
    ticketId: input.ticket.id,
    previous: previousMarks,
    next: persisted,
    rules,
  });
  if (
    persisted.respondedAt !== null &&
    input.ticket.firstResponseAt === null
  ) {
    await persistTicketFirstResponseAt(prisma, input.ticket.id, now);
  }
  return persisted;
}

async function loadCalendarForState(
  prisma: PrismaService,
  state: TicketSlaStateRecord,
): Promise<BusinessMinutesCalendar | null> {
  if (state.slaProfileId === null) {
    return null;
  }
  const profile = await prisma.slaProfile.findUnique({
    where: { id: state.slaProfileId },
    select: { calendarId: true },
  });
  if (profile === null) {
    return null;
  }
  return loadBusinessHoursCalendar(prisma, profile.calendarId);
}

function applyLifecycle(
  state: TicketSlaStateRecord,
  calendar: BusinessMinutesCalendar | null,
  input: SyncTicketSlaTimersInput,
  now: Date,
): TicketSlaStateRecord {
  const previousStatus = input.previousStatus ?? input.ticket.status;
  const shouldPause = isSlaPauseStatus(input.ticket.status, input.configuration);
  const terminal = isSlaTerminalStatus(input.ticket.status);
  let next = state;
  // Package 1.2: a merged child's clock stops (the work runs on the parent)
  // and restarts on unmerge; no other event resumes it while it is merged.
  if (input.event === 'merged') {
    return state.pausedAt === null && !terminal ? applyTicketSlaPause(state, now) : state;
  }
  if (input.event === 'unmerged') {
    return state.pausedAt !== null && !shouldPause && !terminal && calendar !== null
      ? applyTicketSlaResume(calendar, state, now)
      : state;
  }
  if (state.pausedAt === null && shouldPause && !terminal) {
    next = applyTicketSlaPause(next, now);
  } else if (
    next.pausedAt !== null &&
    !shouldPause &&
    !terminal &&
    calendar !== null &&
    isSlaPauseStatus(previousStatus, input.configuration)
  ) {
    next = applyTicketSlaResume(calendar, next, now);
  }
  if (
    input.event === 'agent_replied' ||
    (isSlaFirstResponseStatus(input.ticket.status) &&
      input.event !== 'user_resumed' &&
      input.event !== 'scanned')
  ) {
    next = markTicketSlaResponded(next, now);
  }
  if (terminal) {
    next = markTicketSlaResolutionCompleted(next, now);
  }
  return next;
}
