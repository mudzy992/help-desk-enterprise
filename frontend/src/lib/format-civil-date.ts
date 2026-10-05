import type { TFunction } from "i18next";

/**
 * Datum bez vremena (`YYYY-MM-DD`) na jeziku interfejsa.
 *
 * `Intl.DateTimeFormat` se **ne** koristi za ime mjeseca: u runtimeu sa krnjim
 * ICU podacima bosanski ispadne kao `2026 M10 4` (isti slučaj koji
 * `report-trends-view.ts:153–160`, `announcement-view.ts:117` i
 * `asset-view.ts:209` već rješavaju na svoj način). Uz to bi
 * `new Date("2026-10-04")` bio UTC ponoć, pa bi zapadno od UTC prikazao
 * prethodni dan.
 *
 * Vraća `null` kad datum nije ispravan (`YYYY-MM-DD`, uz opcionalni dio s
 * vremenom koji se ignorše) — pozivalac tada prikazuje „—“.
 */
export function formatCivilDate(value: string, t: TFunction): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value.trim());
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  const valid =
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day;
  if (!valid) {
    return null;
  }
  const monthName = t(
    `changes.calendar.months.m${month - 1}` as "changes.calendar.months.m0",
  );
  return t("ui.dateValue", { day, month: monthName, year });
}
