/**
 * Paket 5.3.1: "created between" filter of the ticket list.
 *
 * The API takes two ISO instants (`createdFrom` ≤ `createdAt` ≤ `createdTo`,
 * both inclusive). The user picks calendar days in THEIR time zone, so the
 * browser turns a day into its local start (00:00:00.000) and end
 * (23:59:59.999) and sends the UTC instants — no zone guessing on the server.
 *
 * Saved views and the URL store the same instants, so a shared link means the
 * same tickets for everyone. Presets are recognised back from the instants
 * (a "Last 7 days" view saved yesterday reads as "Custom" today, by design:
 * it keeps the range it was saved with).
 */
export const createdRangePresets = ["any", "today", "last7", "last30", "thisMonth", "custom"] as const;
export type CreatedRangePreset = (typeof createdRangePresets)[number];

export type CreatedRange = {
  readonly createdFrom: string;
  readonly createdTo: string;
};

export const emptyCreatedRange: CreatedRange = { createdFrom: "", createdTo: "" };

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** `YYYY-MM-DD` of a local calendar day (the value of `<input type="date">`). */
export function toLocalDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parses `YYYY-MM-DD` as a LOCAL calendar day; `null` for anything else. */
export function parseLocalDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 ? date : null;
}

/** ISO instant (as stored in the filters) → the local day for a date input. */
export function instantToLocalDateInput(instant: string): string {
  if (instant === "") return "";
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? "" : toLocalDateInput(date);
}

/** Range for two local days; an empty side stays open. */
export function rangeFromLocalDays(fromDay: string, toDay: string): CreatedRange {
  const from = parseLocalDateInput(fromDay);
  const to = parseLocalDateInput(toDay);
  return {
    createdFrom: from === null ? "" : startOfLocalDay(from).toISOString(),
    createdTo: to === null ? "" : endOfLocalDay(to).toISOString(),
  };
}

export function rangeForPreset(preset: CreatedRangePreset, now: Date = new Date()): CreatedRange | null {
  const end = endOfLocalDay(now).toISOString();
  switch (preset) {
    case "any":
      return emptyCreatedRange;
    case "today":
      return { createdFrom: startOfLocalDay(now).toISOString(), createdTo: end };
    case "last7":
      return { createdFrom: startOfLocalDay(addDays(now, -6)).toISOString(), createdTo: end };
    case "last30":
      return { createdFrom: startOfLocalDay(addDays(now, -29)).toISOString(), createdTo: end };
    case "thisMonth":
      return {
        createdFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        createdTo: end,
      };
    case "custom":
      return null;
  }
}

export function detectCreatedRangePreset(range: CreatedRange, now: Date = new Date()): CreatedRangePreset {
  if (range.createdFrom === "" && range.createdTo === "") return "any";
  for (const preset of ["today", "last7", "last30", "thisMonth"] as const) {
    const candidate = rangeForPreset(preset, now);
    if (
      candidate !== null &&
      candidate.createdFrom === range.createdFrom &&
      candidate.createdTo === range.createdTo
    ) {
      return preset;
    }
  }
  return "custom";
}

/** `true` when both ends are set and the start is after the end. */
export function isCreatedRangeInverted(range: CreatedRange): boolean {
  if (range.createdFrom === "" || range.createdTo === "") return false;
  return new Date(range.createdFrom).getTime() > new Date(range.createdTo).getTime();
}

/** Accepts only well-formed instants from a URL; anything else is dropped. */
export function readCreatedRangeParam(value: string | null): string {
  if (value === null || value.trim() === "") return "";
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : new Date(time).toISOString();
}
