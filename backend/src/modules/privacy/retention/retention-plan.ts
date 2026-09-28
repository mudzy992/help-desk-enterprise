import { localParts, zonedInstant } from '../../notifications/preferences/notification-schedule-time';
import { parseSendTimeMinute } from '../../reports/schedules/report-schedule-calendar';
import {
  privacyLimits,
  retentionCategoriesRequiringDryRun,
  type RetentionCategory,
} from '../privacy.constants';

const dayMs = 24 * 60 * 60 * 1000;

/** Nightly window: a worker that was down at 02:30 catches up until 05:30, never during the day. */
export const retentionNightWindowMinutes = 180;

/** Items older than this instant are due (the period counts from closure/end, see the executors). */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * dayMs);
}

/**
 * Returns the local date key (YYYY-MM-DD) of the night to run now, or null when
 * the local time is outside [runAt, runAt + window).
 */
export function nightlyRunKey(now: Date, timeZone: string, runAtLocalTime: string): string | null {
  const runAtMinute = parseSendTimeMinute(runAtLocalTime);
  if (runAtMinute === null) return null;
  const local = localParts(now, timeZone);
  const start = zonedInstant(timeZone, local.year, local.month, local.day, runAtMinute);
  const elapsed = now.getTime() - start.getTime();
  if (elapsed < 0 || elapsed >= retentionNightWindowMinutes * 60_000) return null;
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

export type RetentionRunSummary = {
  readonly category: string;
  readonly mode: string;
  readonly status: string;
  readonly configDays: number | null;
  readonly startedAt: Date;
};

export type ExecutionGate =
  | { readonly allowed: true; readonly basis: 'not_required' | 'dry_run' | 'previous_execution' }
  | { readonly allowed: false; readonly reason: 'disabled' | 'dry_run_required' };

/**
 * §7.3 obavezan dry-run: a category that deletes business content (attachments,
 * ticket content, audit) executes only if a completed dry run with the same
 * period is at most 24 h old, or an earlier execution already used that period.
 * Changing the period therefore always needs a new dry run.
 */
export function evaluateExecutionGate(input: {
  readonly category: RetentionCategory;
  readonly configDays: number;
  readonly now: Date;
  readonly history: readonly RetentionRunSummary[];
}): ExecutionGate {
  if (input.configDays <= 0) return { allowed: false, reason: 'disabled' };
  if (!retentionCategoriesRequiringDryRun.includes(input.category)) {
    return { allowed: true, basis: 'not_required' };
  }
  const sameCategory = input.history.filter(
    (run) => run.category === input.category && run.configDays === input.configDays,
  );
  const freshDryRun = sameCategory.some(
    (run) =>
      run.mode === 'DRY_RUN' &&
      run.status === 'COMPLETED' &&
      input.now.getTime() - run.startedAt.getTime() <= privacyLimits.dryRunValidityMs,
  );
  if (freshDryRun) return { allowed: true, basis: 'dry_run' };
  const previousExecution = sameCategory.some(
    (run) => run.mode === 'EXECUTE' && (run.status === 'COMPLETED' || run.status === 'PARTIAL'),
  );
  if (previousExecution) return { allowed: true, basis: 'previous_execution' };
  return { allowed: false, reason: 'dry_run_required' };
}

/** Execution order: cheap technical data first, the audit chain last. */
export const retentionExecutionOrder: readonly RetentionCategory[] = [
  'sessions',
  'emailDeliveries',
  'requestRegister',
  'attachments',
  'ticketContent',
  'audit',
];

/** Collects ticket numbers up to the cap; the rest is only counted. */
export class RetentionRefCollector {
  private readonly refs: string[] = [];
  private truncated = false;

  add(values: readonly string[]): void {
    for (const value of values) {
      if (this.refs.length >= privacyLimits.runRefsMax) {
        this.truncated = true;
        return;
      }
      this.refs.push(value);
    }
  }

  result(): { readonly refs: string[]; readonly truncated: boolean } {
    return { refs: [...this.refs], truncated: this.truncated };
  }
}
