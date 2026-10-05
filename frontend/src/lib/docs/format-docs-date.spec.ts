import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { formatDocsDate } from "./format-docs-date";

/** Prijevodi kakvi su u `locales/{bs,en}/common.json` (dijele se sa kalendarom promjena). */
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

function fakeT(locale: "bs" | "en"): TFunction {
  const months = locale === "bs" ? bsMonths : enMonths;
  return ((key: string, options?: Record<string, unknown>) => {
    const month = /^changes\.calendar\.months\.m(\d+)$/.exec(key);
    if (month !== null) {
      return months[Number(month[1])] ?? key;
    }
    if (key === "docs.updatedAtValue") {
      return locale === "bs"
        ? `${options?.day}. ${options?.month} ${options?.year}.`
        : `${options?.month} ${options?.day}, ${options?.year}`;
    }
    return key;
  }) as unknown as TFunction;
}

// Stvarni prikaz prije popravke (2026-10-05): u runtimeu sa krnjim ICU podacima
// `Intl.DateTimeFormat("bs", { dateStyle: "medium" })` je vraćao „2026 M10 4“.
describe("formatDocsDate", () => {
  it("ispisuje bosanski datum iz manifesta bez Intl-a", () => {
    expect(formatDocsDate("2026-10-04", fakeT("bs"))).toBe("4. oktobar 2026.");
    expect(formatDocsDate("2026-01-01", fakeT("bs"))).toBe("1. januar 2026.");
    expect(formatDocsDate("2026-12-31", fakeT("bs"))).toBe("31. decembar 2026.");
  });

  it("ispisuje engleski datum kad je UI na engleskom", () => {
    expect(formatDocsDate("2026-10-04", fakeT("en"))).toBe("October 4, 2026");
  });

  it("ignoriše dio s vremenom i ne pomjera datum zbog vremenske zone", () => {
    expect(formatDocsDate("2026-10-04T23:30:00Z", fakeT("bs"))).toBe("4. oktobar 2026.");
    expect(formatDocsDate("  2026-10-04  ", fakeT("bs"))).toBe("4. oktobar 2026.");
  });

  it("vraća null za neispravan datum (pozivalac prikazuje „—“)", () => {
    expect(formatDocsDate("", fakeT("bs"))).toBeNull();
    expect(formatDocsDate("2026-10", fakeT("bs"))).toBeNull();
    expect(formatDocsDate("2026-13-01", fakeT("bs"))).toBeNull();
    expect(formatDocsDate("2026-00-10", fakeT("bs"))).toBeNull();
    expect(formatDocsDate("2026-02-30", fakeT("bs"))).toBeNull();
    expect(formatDocsDate("04.10.2026", fakeT("bs"))).toBeNull();
    expect(formatDocsDate("nepoznato", fakeT("bs"))).toBeNull();
  });
});
