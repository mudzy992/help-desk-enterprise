import type { TFunction } from "i18next";

/**
 * „Ažurirano: <datum>“ u dokumentaciji.
 *
 * `updatedAt` iz manifesta je datum bez vremena (`YYYY-MM-DD`, vidi
 * `scripts/generate-docs-content.mjs`), pa se čita iz samog stringa:
 *  - `Intl.DateTimeFormat` se **ne** koristi, jer u runtimeu sa krnjim ICU
 *    podacima bosanski ispadne kao `2026 M10 4` (isti slučaj koji
 *    `report-trends-view.ts` rješava vlastitim imenima mjeseci);
 *  - `new Date("2026-10-04")` se tumači kao UTC ponoć, pa bi u vremenskim
 *    zonama zapadno od UTC prikazao prethodni dan.
 *
 * Vraća `null` kad datum nije ispravan (`YYYY-MM-DD`, uz opcionalni dio s
 * vremenom koji se ignorše) — pozivalac tada prikazuje „—“.
 */
export function formatDocsDate(value: string, t: TFunction): string | null {
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
  return t("docs.updatedAtValue", { day, month: monthName, year });
}
