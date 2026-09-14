import type { BadgeTone } from "@/components/ui/badge";
import type { TicketSlaSnapshot } from "@/services/tickets-api";

export const SLA_RISK_PERCENT = 75;

export type TicketSlaStateKind = "OK" | "RISK" | "BREACHED";

export type TicketSlaTimerView = {
  readonly satisfied: boolean;
  readonly paused: boolean;
  readonly overdue: boolean;
  readonly remainingMs: number;
  readonly usedPercent: number;
  readonly tone: BadgeTone;
};

export type TicketSlaPanelView = {
  readonly response: TicketSlaTimerView;
  readonly resolution: TicketSlaTimerView;
  readonly state: TicketSlaStateKind;
  readonly dueAt: string | null;
};

export function mapTicketSlaPanel(
  sla: TicketSlaSnapshot | null | undefined,
  now: Date,
): TicketSlaPanelView | null {
  if (sla === null || sla === undefined) {
    return null;
  }
  const clock = sla.pausedAt === null ? now : new Date(sla.pausedAt);
  const paused = sla.pausedAt !== null;
  const response = mapTimer({
    kind: "response",
    startedAt: sla.startedAt,
    dueAt: sla.responseDueAt,
    completedAt: sla.respondedAt,
    breached: sla.isResponseBreached,
    clock,
    paused,
  });
  const resolution = mapTimer({
    kind: "resolution",
    startedAt: sla.startedAt,
    dueAt: sla.resolutionDueAt,
    completedAt: sla.resolutionCompletedAt,
    breached: sla.isResolutionBreached,
    clock,
    paused,
  });
  return {
    response,
    resolution,
    state: mapState(sla, response, resolution),
    dueAt: sla.resolutionDueAt,
  };
}

function mapTimer(input: {
  readonly kind: "response" | "resolution";
  readonly startedAt: string;
  readonly dueAt: string | null;
  readonly completedAt: string | null;
  readonly breached: boolean;
  readonly clock: Date;
  readonly paused: boolean;
}): TicketSlaTimerView {
  const satisfied = input.completedAt !== null;
  const remainingSigned = signedRemainingMs(input.dueAt, input.clock);
  const clockOverdue = remainingSigned !== null && remainingSigned < 0;
  const overdue = !satisfied && (input.breached || clockOverdue);
  const usedPercent = satisfied
    ? 100
    : usedWindowPercent(input.startedAt, input.dueAt, input.clock);
  return {
    satisfied,
    paused: input.paused,
    overdue,
    remainingMs: remainingSigned === null ? 0 : Math.abs(remainingSigned),
    usedPercent,
    tone: toneForTimer(input.kind, satisfied, overdue, usedPercent),
  };
}

function mapState(
  sla: TicketSlaSnapshot,
  response: TicketSlaTimerView,
  resolution: TicketSlaTimerView,
): TicketSlaStateKind {
  if (sla.isResponseBreached || sla.isResolutionBreached) {
    return "BREACHED";
  }
  const responseRisk = !response.satisfied && response.usedPercent > SLA_RISK_PERCENT;
  if (responseRisk || resolution.usedPercent > SLA_RISK_PERCENT) {
    return "RISK";
  }
  return "OK";
}

function toneForTimer(
  kind: "response" | "resolution",
  satisfied: boolean,
  overdue: boolean,
  usedPercent: number,
): BadgeTone {
  if (satisfied) {
    return "success";
  }
  if (overdue) {
    return "danger";
  }
  if (usedPercent > SLA_RISK_PERCENT) {
    return "warning";
  }
  return kind === "response" ? "primary" : "success";
}

function signedRemainingMs(dueAt: string | null, clock: Date): number | null {
  if (dueAt === null) {
    return null;
  }
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) {
    return null;
  }
  return due - clock.getTime();
}

function usedWindowPercent(
  startedAt: string,
  dueAt: string | null,
  clock: Date,
): number {
  if (dueAt === null) {
    return 0;
  }
  const start = new Date(startedAt).getTime();
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(due) || due <= start) {
    return 0;
  }
  return Math.min(100, Math.max(0, ((clock.getTime() - start) / (due - start)) * 100));
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function formatSlaRemainingTime(ms: number): {
  readonly count: number;
  readonly unit: "minute" | "hour" | "day";
} {
  const absolute = Math.abs(ms);
  if (absolute < HOUR_MS) {
    return { count: Math.round(absolute / MINUTE_MS), unit: "minute" };
  }
  if (absolute < DAY_MS) {
    return { count: Math.round(absolute / HOUR_MS), unit: "hour" };
  }
  return { count: Math.round(absolute / DAY_MS), unit: "day" };
}
