/**
 * The reporting day boundary, expressed in a named time zone.
 *
 * Why this exists: the dashboard's "opened today" counter has to agree with the
 * day the *installation* lives in, not with whatever zone the server process
 * happens to run in. Before this helper the boundary came from
 * `new Date(y, m, d)`, which reads the process zone: a container on `TZ=UTC`
 * and a developer machine on `TZ=Europe/Sarajevo` produced two different
 * boundaries for the same request, which is exactly how the CI-vs-Windows
 * difference showed up.
 *
 * The zone is an IANA name (`Europe/Sarajevo`), so the answer is a property of
 * the installation and the plan (one help desk, one working day), never of the
 * machine that runs the query. `Intl` is the only dependency: the runtime
 * already ships the IANA database, so there is no offset table to keep correct
 * and no new package.
 */

/** A civil date in a zone — `month` is 1–12, unlike `Date.getMonth()`. */
export type CivilDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

type ZonedParts = CivilDate & {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
};

/**
 * `00:00` of the civil day that `now` falls in, inside `timeZone`.
 *
 * The guess is UTC midnight of that civil date; the answer is the guess shifted
 * by the zone offset that is in effect *at the shifted instant*. The offset is
 * read again after each shift, because the one in effect at UTC midnight is not
 * always the one in effect at local midnight (a DST switch on the boundary
 * day). Every correction is applied to the original guess — never to the
 * already-corrected value, which would count the offset twice. The loop is
 * bounded, so a zone whose offset never settles still returns a value instead
 * of spinning.
 */
export function startOfCivilDay(now: Date, timeZone: string): Date {
  const civil = civilDateOf(now, timeZone);
  const guess = Date.UTC(civil.year, civil.month - 1, civil.day);
  let candidate = guess;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const corrected = guess - offsetMillisecondsAt(new Date(candidate), timeZone);
    if (corrected === candidate) {
      break;
    }
    candidate = corrected;
  }
  return new Date(candidate);
}

/** The civil day of `instant` in `timeZone`, as `YYYY-MM-DD`. */
export function civilDayKey(instant: Date, timeZone: string): string {
  const civil = civilDateOf(instant, timeZone);
  return `${String(civil.year).padStart(4, '0')}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`;
}

/** The civil date of `instant` in `timeZone` (the zone arithmetic is `Intl`'s). */
export function civilDateOf(instant: Date, timeZone: string): CivilDate {
  const parts = zonedParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/**
 * How far ahead of UTC the zone's wall clock is at `instant`, in milliseconds:
 * positive east of Greenwich (`Europe/Sarajevo` → +1h in winter, +2h in
 * summer), negative west (`America/New_York` → −5h/−4h).
 */
export function offsetMillisecondsAt(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // `instant` is whole milliseconds; the wall clock is whole seconds, so the
  // difference is the offset plus (at most) the sub-second part of `instant`.
  return wallClock - instant.getTime() + instant.getMilliseconds();
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Map(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value] as const),
  );
  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
    hour: Number(parts.get('hour')),
    minute: Number(parts.get('minute')),
    second: Number(parts.get('second')),
  };
}
