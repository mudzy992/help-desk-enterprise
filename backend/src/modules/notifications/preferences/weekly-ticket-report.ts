import { isTicketSlaOverdue } from '../../sla/is-ticket-sla-overdue';
import type { TicketSlaClientSnapshot } from '../../tickets/tickets.types';
import { localParts, zonedInstant } from './notification-schedule-time';

/** Paket 2.2a (W2): statuses that end the agent's responsibility. */
export const weeklyReportClosedStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

export type WeeklyReportRole = 'ASSIGNEE' | 'WATCHER' | 'APPROVER';
export type WeeklyReportSection = 'overdue' | 'assigned' | 'watching';

export type WeeklyReportTicket = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly isConfidential: boolean;
  readonly classification?: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type WeeklyReportEntry = {
  readonly ticket: WeeklyReportTicket;
  readonly role: WeeklyReportRole;
  readonly section: WeeklyReportSection;
  readonly overdue: boolean;
  readonly dueAt: Date | null;
};

const priorityRank: Readonly<Record<string, number>> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const sectionRank: Readonly<Record<WeeklyReportSection, number>> = { overdue: 0, assigned: 1, watching: 2 };
const roleRank: Readonly<Record<WeeklyReportRole, number>> = { ASSIGNEE: 0, APPROVER: 1, WATCHER: 2 };

/**
 * Most recent weekly slot at or before `now` (ISO weekday 1 = Monday … 7 =
 * Sunday, wall-clock minute in the installation zone). Always within 7 days.
 */
export function weeklyReportSlot(now: Date, timeZone: string, isoDayOfWeek: number, minute: number): Date {
  for (let offset = 0; offset <= 7; offset += 1) {
    const probe = new Date(now.getTime() - offset * 86_400_000);
    const local = localParts(probe, timeZone);
    const isoWeekday = local.weekday === 0 ? 7 : local.weekday;
    if (isoWeekday !== isoDayOfWeek) continue;
    const slot = zonedInstant(timeZone, local.year, local.month, local.day, minute);
    if (slot.getTime() <= now.getTime()) return slot;
  }
  // Unreachable for valid input; keeps the type total.
  return new Date(now.getTime() - 7 * 86_400_000);
}

/** ISO-8601 week number and week-year of a date in the installation zone. */
export function isoWeek(date: Date, timeZone: string): { readonly year: number; readonly week: number } {
  const local = localParts(date, timeZone);
  const day = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const weekday = local.weekday === 0 ? 7 : local.weekday;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: day.getUTCFullYear(), week };
}

export function isWeeklyReportOverdue(snapshot: TicketSlaClientSnapshot | undefined, now: Date): boolean {
  if (snapshot === undefined) return false;
  if (isTicketSlaOverdue(snapshot)) return true;
  return (
    snapshot.resolutionDueAt !== null &&
    snapshot.resolutionCompletedAt === null &&
    snapshot.pausedAt === null &&
    new Date(snapshot.resolutionDueAt).getTime() < now.getTime()
  );
}

/**
 * W2/W3: one entry per ticket with the strongest role, in the section that
 * matters most, ordered by section → priority → oldest first.
 */
export function buildWeeklyReportEntries(input: {
  readonly memberships: readonly { readonly ticket: WeeklyReportTicket; readonly role: WeeklyReportRole }[];
  readonly sla: ReadonlyMap<string, TicketSlaClientSnapshot>;
  readonly now: Date;
}): WeeklyReportEntry[] {
  const byTicket = new Map<string, { ticket: WeeklyReportTicket; role: WeeklyReportRole }>();
  for (const membership of input.memberships) {
    if ((weeklyReportClosedStatuses as readonly string[]).includes(membership.ticket.status)) continue;
    // An approver only matters while the approval is pending.
    if (membership.role === 'APPROVER' && membership.ticket.status !== 'PENDING_APPROVAL') continue;
    const current = byTicket.get(membership.ticket.id);
    if (current === undefined || roleRank[membership.role] < roleRank[current.role]) {
      byTicket.set(membership.ticket.id, membership);
    }
  }
  const entries = [...byTicket.values()].map(({ ticket, role }): WeeklyReportEntry => {
    const snapshot = input.sla.get(ticket.id);
    const overdue = isWeeklyReportOverdue(snapshot, input.now);
    const section: WeeklyReportSection = overdue ? 'overdue' : role === 'ASSIGNEE' ? 'assigned' : 'watching';
    const due = snapshot?.resolutionDueAt ?? null;
    return { ticket, role, section, overdue, dueAt: due === null ? null : new Date(due) };
  });
  return entries.sort(
    (left, right) =>
      sectionRank[left.section] - sectionRank[right.section] ||
      (priorityRank[left.ticket.priority] ?? 9) - (priorityRank[right.ticket.priority] ?? 9) ||
      left.ticket.createdAt.getTime() - right.ticket.createdAt.getTime(),
  );
}
