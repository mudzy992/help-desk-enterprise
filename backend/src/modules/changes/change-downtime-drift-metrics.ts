import type Redis from "ioredis";

/**
 * W7.69 (`BA-changes-13`): the downtime reconciler knew how much drift it had
 * just found, but only wrote it to the log — `change_downtime_drift detected=N`
 * scrolled away and nothing on the health card could answer "does the calendar
 * still match the plan?". The reconciler therefore stores the summary of its
 * last *completed* keyset pass here and the worker's signal collector reads it.
 *
 * The record is a metric, not a queue: it carries counts and one instant, never
 * a change id, a title or a service name. Losing it (Redis flush) is safe — the
 * next pass writes a fresh one, and a missing record is reported as "unknown",
 * which never opens an alarm.
 */
export const changeDowntimeDriftMetricKey = "changes:ops:downtime-drift";
/** One day of history: enough to see "it stopped happening" without growth. */
export const changeDowntimeDriftMetricTtlSeconds = 24 * 60 * 60;

export type ChangeDowntimeDriftPass = Readonly<{
  /** When the pass that produced these numbers finished. */
  completedAtMs: number;
  /** Changes inspected in the pass (bounded by the keyset page size). */
  scanned: number;
  /** Changes whose downtime windows did not match the planned state. */
  drifted: number;
}>;

type DriftRedis = Pick<Redis, "set" | "get">;

export class ChangeDowntimeDriftMetricStore {
  constructor(
    private readonly redis: DriftRedis,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async record(pass: Omit<ChangeDowntimeDriftPass, "completedAtMs">): Promise<void> {
    const value: ChangeDowntimeDriftPass = {
      completedAtMs: this.now(),
      scanned: pass.scanned,
      drifted: pass.drifted,
    };
    await this.redis.set(
      changeDowntimeDriftMetricKey,
      JSON.stringify(value),
      "EX",
      changeDowntimeDriftMetricTtlSeconds,
    );
  }

  /** Fail-closed reader: a missing or malformed record is `null`, never zero. */
  async read(): Promise<ChangeDowntimeDriftPass | null> {
    const raw = await this.redis.get(changeDowntimeDriftMetricKey);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const value = parsed as Record<string, unknown>;
      const completedAtMs = value.completedAtMs;
      const scanned = value.scanned;
      const drifted = value.drifted;
      if (
        typeof completedAtMs !== "number" ||
        typeof scanned !== "number" ||
        typeof drifted !== "number"
      ) {
        return null;
      }
      return { completedAtMs, scanned, drifted };
    } catch {
      return null;
    }
  }
}
