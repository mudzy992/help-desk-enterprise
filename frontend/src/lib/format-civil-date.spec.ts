import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { formatCivilDate } from "./format-civil-date";

/** Prijevodi kakvi su u `locales/{bs,en}/common.json` (dijele ih kalendar i dežurstva). */
const bsMonths = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
];
const enMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const bsWeekdays = {
  short: ["pon", "uto", "sri", "čet", "pet", "sub", "ned"],
  long: ["ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota", "nedjelja"],
};
const enWeekdays = {
  short: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  long: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

/**
 * Prevodi kao u `locales/{bs,en}/common.json` — koriste ga i specovi dežurstava
 * i SLA-a, pa pokriva i nazive dana i šablone datuma.
 */
export function fakeDateTranslator(locale: "bs" | "en"): TFunction {
  const bs = locale === "bs";
  const months = bs ? bsMonths : enMonths;
  const weekdays = bs ? bsWeekdays : enWeekdays;
  return ((key: string, options?: Record<string, unknown>) => {
    const month = /^changes\.calendar\.months\.m(\d+)$/.exec(key);
    if (month !== null) {
      return months[Number(month[1])] ?? key;
    }
    const weekday = /^changes\.calendar\.weekdays\.(short|long)(\d)$/.exec(key);
    if (weekday !== null) {
      return weekdays[weekday[1] as "short" | "long"][Number(weekday[2])] ?? key;
    }
    if (key === "changes.calendar.dayLabel") {
      return bs
        ? `${options?.weekday}, ${options?.day}. ${options?.month} ${options?.year}.`
        : `${options?.weekday}, ${options?.day} ${options?.month} ${options?.year}`;
    }
    if (key === "onCall.timeWithWeekday") {
      return bs
        ? `${options?.weekday} ${options?.day}.${options?.month}. ${options?.time}`
        : `${options?.weekday} ${options?.day}/${options?.month} ${options?.time}`;
    }
    if (key === "ui.dateValue") {
      return bs
        ? `${options?.day}. ${options?.month} ${options?.year}.`
        : `${options?.month} ${options?.day}, ${options?.year}`;
    }
    return key;
  }) as unknown as TFunction;
}

// Stvarni prikaz prije popravke (2026-10-05): u runtimeu sa krnjim ICU podacima
// `Intl.DateTimeFormat("bs", { dateStyle: "medium" })` je vraćao „2026 M10 4“.
describe("formatCivilDate", () => {
  it("ispisuje bosanski datum bez Intl-a", () => {
    expect(formatCivilDate("2026-10-04", fakeDateTranslator("bs"))).toBe("4. oktobar 2026.");
    expect(formatCivilDate("2026-01-01", fakeDateTranslator("bs"))).toBe("1. januar 2026.");
    expect(formatCivilDate("2026-12-31", fakeDateTranslator("bs"))).toBe("31. decembar 2026.");
  });

  it("ispisuje engleski datum kad je UI na engleskom", () => {
    expect(formatCivilDate("2026-10-04", fakeDateTranslator("en"))).toBe("October 4, 2026");
  });

  it("ignoriše dio s vremenom i ne pomjera datum zbog vremenske zone", () => {
    expect(formatCivilDate("2026-10-04T23:30:00Z", fakeDateTranslator("bs"))).toBe("4. oktobar 2026.");
    expect(formatCivilDate("  2026-10-04  ", fakeDateTranslator("bs"))).toBe("4. oktobar 2026.");
  });

  it("vraća null za neispravan datum (pozivalac prikazuje „—“)", () => {
    expect(formatCivilDate("", fakeDateTranslator("bs"))).toBeNull();
    expect(formatCivilDate("2026-10", fakeDateTranslator("bs"))).toBeNull();
    expect(formatCivilDate("2026-13-01", fakeDateTranslator("bs"))).toBeNull();
    expect(formatCivilDate("2026-00-10", fakeDateTranslator("bs"))).toBeNull();
    expect(formatCivilDate("2026-02-30", fakeDateTranslator("bs"))).toBeNull();
    expect(formatCivilDate("04.10.2026", fakeDateTranslator("bs"))).toBeNull();
    expect(formatCivilDate("nepoznato", fakeDateTranslator("bs"))).toBeNull();
  });
});
