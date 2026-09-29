import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import type { OnCallSegmentView } from "@/services/on-call-api";
import {
  fromDateTimeLocalValue,
  groupSegmentsByDay,
  mapOnCallError,
  moveItem,
  startOfWeek,
  zonedMidnight,
} from "./on-call-view";

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
