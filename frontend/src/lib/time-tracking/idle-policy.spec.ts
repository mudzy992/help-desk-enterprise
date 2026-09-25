import { describe, expect, it } from "vitest";
import { decideIdle, formatElapsed } from "./idle-policy";

const minute = 60_000;

describe("decideIdle (package 1.3, T3)", () => {
  it("stays active and sends heartbeats while the user works", () => {
    expect(
      decideIdle({ now: 10 * minute, lastActivityAt: 9.5 * minute, hiddenSince: null, idleMinutes: 10 }),
    ).toEqual({ kind: "active", sendHeartbeat: true });
  });

  it("pauses at the last activity after the idle window", () => {
    expect(
      decideIdle({ now: 20 * minute, lastActivityAt: 9 * minute, hiddenSince: null, idleMinutes: 10 }),
    ).toEqual({ kind: "idle", endedAt: 9 * minute });
  });

  it("does not send heartbeats from a hidden tab", () => {
    expect(
      decideIdle({ now: 5 * minute, lastActivityAt: 4.5 * minute, hiddenSince: 4.6 * minute, idleMinutes: 10 }),
    ).toEqual({ kind: "active", sendHeartbeat: false });
  });

  it("never pauses when the idle guard is off", () => {
    expect(
      decideIdle({ now: 500 * minute, lastActivityAt: 0, hiddenSince: 1, idleMinutes: 0 }).kind,
    ).toBe("active");
  });
});

describe("formatElapsed", () => {
  it("formats minutes and hours", () => {
    expect(formatElapsed(new Date(0).toISOString(), 65_000)).toBe("01:05");
    expect(formatElapsed(new Date(0).toISOString(), 3_725_000)).toBe("1:02:05");
  });
});
