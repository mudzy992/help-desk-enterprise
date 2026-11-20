/**
 * W7.77 (`BA-changes-19`): the change module clamps its own configuration.
 *
 * The settings layer already validates the standard UI path (see `settings/definitions/change-settings.ts`), but a
 * value can reach the module without passing through it — a direct database edit, a restore from an older dump, a
 * bootstrap script, or a row written by a previous release. Every one of those used to be accepted as long as it was
 * an integer, and the consequences were real:
 *
 * - a huge `minLeadTimeHours` silently blocks every normal change (the lead-time check turns into a wall nobody can
 *   move), a negative one disables the check the administrator thought was on;
 * - a huge `reminderHoursBeforeStart` makes the sweep scan (and remind) months ahead, while the ops-health card —
 *   which *did* clamp to 0..168 — described a different window than the sweep used;
 * - a `reminderHoursBeforeStart` of `NaN`/`Infinity` produced an invalid date range in the sweep query;
 * - a `NaN` quorum made `evaluateChangeVotes` return PENDING forever, so the round never finished.
 *
 * The bounds below mirror the setting definitions exactly. Clamping (not rejecting) is deliberate: the module stays
 * usable and the mismatch is logged, instead of failing closed on a value the administrator cannot see.
 */
export type ChangeIntegerBounds = {
  readonly min: number;
  readonly max: number;
};

export const changeConfigurationBounds = {
  /** CAB approvals for a normal change (settings: 1..20). */
  normalQuorum: { min: 1, max: 20 },
  /** CAB approvals for an emergency change (settings: 1..20). */
  emergencyQuorum: { min: 1, max: 20 },
  /** Hours between sending a change to the CAB and its planned start (0..720 = 30 days). */
  minLeadTimeHours: { min: 0, max: 720 },
  /** Hours before the planned start to remind the owner (0..168 = 7 days). */
  reminderHoursBeforeStart: { min: 0, max: 168 },
} as const satisfies Record<string, ChangeIntegerBounds>;

/**
 * `value` into `bounds`; anything that is not an integer falls back to the default, which is itself clamped so a
 * broken default cannot escape the bounds either.
 */
export function clampChangeInteger(value: unknown, bounds: ChangeIntegerBounds, fallback: number): number {
  const base = Math.min(bounds.max, Math.max(bounds.min, Math.trunc(fallback)));
  if (typeof value !== 'number' || !Number.isInteger(value)) return base;
  return Math.min(bounds.max, Math.max(bounds.min, value));
}
