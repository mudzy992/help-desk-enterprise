import { describe, expect, it } from "vitest";
import {
  detectCreatedRangePreset,
  instantToLocalDateInput,
  isCreatedRangeInverted,
  parseLocalDateInput,
  rangeForPreset,
  rangeFromLocalDays,
  readCreatedRangeParam,
} from "./created-range";

const now = new Date(2026, 9, 8, 14, 30); // 8 Oct 2026, local

describe("created range", () => {
  it("turns local days into inclusive local-day bounds", () => {
    const range = rangeFromLocalDays("2026-10-01", "2026-10-08");
    expect(new Date(range.createdFrom).getTime()).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).getTime());
    expect(new Date(range.createdTo).getTime()).toBe(new Date(2026, 9, 8, 23, 59, 59, 999).getTime());
    expect(instantToLocalDateInput(range.createdFrom)).toBe("2026-10-01");
    expect(instantToLocalDateInput(range.createdTo)).toBe("2026-10-08");
  });

  it("keeps an empty side open", () => {
    expect(rangeFromLocalDays("", "2026-10-08").createdFrom).toBe("");
    expect(rangeFromLocalDays("2026-10-01", "").createdTo).toBe("");
  });

  it("rejects malformed and impossible days", () => {
    expect(parseLocalDateInput("2026-02-30")).toBeNull();
    expect(parseLocalDateInput("08.10.2026")).toBeNull();
  });

  it("computes presets and recognises them back", () => {
    const last7 = rangeForPreset("last7", now);
    expect(last7).not.toBeNull();
    expect(instantToLocalDateInput(last7!.createdFrom)).toBe("2026-10-02");
    expect(detectCreatedRangePreset(last7!, now)).toBe("last7");
    const month = rangeForPreset("thisMonth", now)!;
    expect(instantToLocalDateInput(month.createdFrom)).toBe("2026-10-01");
    expect(detectCreatedRangePreset({ createdFrom: "", createdTo: "" }, now)).toBe("any");
    expect(detectCreatedRangePreset(rangeFromLocalDays("2026-09-01", "2026-09-15"), now)).toBe("custom");
  });

  it("flags an inverted range", () => {
    expect(isCreatedRangeInverted(rangeFromLocalDays("2026-10-08", "2026-10-01"))).toBe(true);
    expect(isCreatedRangeInverted(rangeFromLocalDays("2026-10-08", "2026-10-08"))).toBe(false);
  });

  it("sanitises URL values", () => {
    expect(readCreatedRangeParam("nonsense")).toBe("");
    expect(readCreatedRangeParam(null)).toBe("");
    expect(readCreatedRangeParam("2026-10-01T00:00:00.000Z")).toBe("2026-10-01T00:00:00.000Z");
  });
});
