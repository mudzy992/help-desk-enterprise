/** Facts of a change the sweep looks at. */
export type ChangeReminderFacts = {
  readonly status: string;
  readonly plannedStart: Date | null;
  readonly plannedEnd: Date | null;
  readonly reminderSentAt: Date | null;
  readonly overdueNotifiedAt: Date | null;
};

/**
 * §14: a scheduled change gets one reminder `hoursBefore` hours before its
 * start (0 = off, never after the start); an implementing change past its
 * planned end gets one overrun warning. Moving the window clears both marks.
 */
export function planChangeReminder(facts: ChangeReminderFacts, now: Date, hoursBefore: number): 'starting_soon' | 'overdue' | null {
  if (facts.status === 'SCHEDULED' && hoursBefore > 0 && facts.plannedStart !== null && facts.reminderSentAt === null) {
    const start = facts.plannedStart.getTime();
    if (now.getTime() < start && start - now.getTime() <= hoursBefore * 3_600_000) return 'starting_soon';
  }
  if (facts.status === 'IMPLEMENTING' && facts.plannedEnd !== null && facts.overdueNotifiedAt === null && now.getTime() > facts.plannedEnd.getTime()) {
    return 'overdue';
  }
  return null;
}
