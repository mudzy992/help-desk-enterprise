import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import type { OnCallSegmentView } from "@/services/on-call-api";
import {
  formatOnCallDayLabel,
  formatOnCallTime,
  formatOnCallWeekday,
  fromDateTimeLocalValue,
  groupSegmentsByDay,
  mapOnCallError,
  moveItem,
  onCallWeekdayIndex,
  startOfWeek,
  zonedMidnight,
} from "./on-call-view";
import { fakeDateTranslator } from "@/lib/format-civil-date.spec";

const tz = "Europe/Sarajevo";
const seg = (startsAt: string, endsAt: string, name: string | null): OnCallSegmentView => ({
  startsAt,
  endsAt,
  source: name === null ? "none" : "rotation",
  person: name === null ? null : { userId: name, displayName: name, isAvailable: true },
});

describe("on-call view helpers (Paket 2.9 K3)", () => {
  it("maps known error codes only", () => {
    expect(mapOnCallError(new ApiError(409, "ON_CALL_OVERRIDE_OVERLAP", "x"))).toBe("onCall.errors.overlap");
    expect(mapOnCallError(new ApiError(400, "OTHER", "x"))).toBeNull();
    expect(mapOnCallError(new Error("x"))).toBeNull();
  });

  it("finds local midnight across the DST change", () => {
    expect(zonedMidnight(2026, 3, 29, tz).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedMidnight(2026, 3, 30, tz).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(startOfWeek(new Date("2026-10-01T10:00:00Z"), tz).toISOString()).toBe("2026-09-27T22:00:00.000Z");
  });

  it("lists each day once, including the 23-hour DST day, with overlapping shifts", () => {
    const segments = [
      seg("2026-03-23T07:00:00Z", "2026-03-30T06:00:00Z", "ana"),
      seg("2026-03-30T06:00:00Z", "2026-04-06T06:00:00Z", "bojan"),
    ];
    const days = groupSegmentsByDay(segments, zonedMidnight(2026, 3, 28, tz), 4, tz, new Date("2026-03-29T10:00:00Z"));
    expect(days.map((day) => day.key)).toEqual(["2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
    expect(days[1]!.isToday).toBe(true);
    expect(days[2]!.entries.map((entry) => [entry.segment.person?.displayName, entry.startsHere])).toEqual([
      ["ana", false],
      ["bojan", true],
    ]);
  });

  it("parses datetime-local values and reorders members", () => {
    expect(fromDateTimeLocalValue("bad")).toBeNull();
    expect(fromDateTimeLocalValue("2026-10-01T08:00")).toMatch(/^2026-10-01T\d{2}:00:00\.000Z$/);
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

// Isti kvar kao u dokumentaciji (2026-10-05): `Intl.DateTimeFormat("bs-BA",
// { weekday: "short" })` u runtimeu bez bosanskih CLDR podataka ispiše „Mon“.
describe("on-call datumi bez Intl naziva (val 4)", () => {
  // 05.10.2026. je ponedjeljak; 03.10.2026. je subota.
  const monday = new Date("2026-10-05T09:00:00Z");
  const saturday = new Date("2026-10-03T21:30:00Z");

  it("računa dan u sedmici u zadatoj zoni (0 = ponedjeljak)", () => {
    expect(onCallWeekdayIndex(monday, tz)).toBe(0);
    expect(onCallWeekdayIndex(saturday, tz)).toBe(5);
    // Isti trenutak u zoni iza UTC-a je već nedjelja.
    expect(onCallWeekdayIndex(saturday, "Pacific/Auckland")).toBe(6);
  });

  it("uzima naziv dana iz prijevoda, ne iz Intl-a", () => {
    expect(formatOnCallWeekday(monday, tz, fakeDateTranslator("bs"), "short")).toBe("pon");
    expect(formatOnCallWeekday(monday, tz, fakeDateTranslator("bs"), "long")).toBe("ponedjeljak");
    expect(formatOnCallWeekday(saturday, tz, fakeDateTranslator("en"), "short")).toBe("Sat");
  });

  it("sastavlja puni label dana za sr-only", () => {
    expect(formatOnCallDayLabel(monday, tz, fakeDateTranslator("bs"))).toBe(
      "ponedjeljak, 5. oktobar 2026.",
    );
  });

  it("sastavlja vrijeme smjene s nazivom dana iz prijevoda", () => {
    const bs = fakeDateTranslator("bs");
    expect(formatOnCallTime("2026-10-05T06:00:00Z", bs, tz)).toBe("pon 5.10. 08:00");
    // Nepoznat datum se vraća kakav jeste (nema izmišljanja).
    expect(formatOnCallTime("nije-datum", bs, tz)).toBe("nije-datum");
  });
});
