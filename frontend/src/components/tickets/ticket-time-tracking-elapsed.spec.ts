import { describe, expect, it } from "vitest";
import { formatElapsedDuration } from "@/components/tickets/ticket-time-tracking-elapsed";

describe("formatElapsedDuration", () => {
  it("formats elapsed time as a live clock including hours", () => {
    const startedAt = "2026-10-14T10:00:00.000Z";
    const now = Date.parse("2026-10-14T12:34:56.000Z");
    expect(formatElapsedDuration(startedAt, now)).toBe("02:34:56");
  });

  it("clamps future start times and handles invalid timestamps", () => {
    expect(
      formatElapsedDuration("2026-10-14T10:00:00.000Z", Date.parse("2026-10-14T09:00:00.000Z")),
    ).toBe("00:00:00");
    expect(formatElapsedDuration("not-a-date", 0)).toBe("00:00:00");
  });
});
