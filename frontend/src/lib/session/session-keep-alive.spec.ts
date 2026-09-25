import { describe, expect, it } from "vitest";
import { decideKeepAlive, readTokenExpiryMs, sessionKeepAlive } from "./session-keep-alive";

const token = (exp: number) =>
  `h.${btoa(JSON.stringify({ sub: "u", exp })).replace(/=+$/, "")}.s`;

describe("session keep-alive (review 2026-09-25)", () => {
  it("reads exp from the JWT", () => {
    expect(readTokenExpiryMs(token(1000))).toBe(1_000_000);
    expect(readTokenExpiryMs("garbage")).toBeNull();
  });
  it("refreshes an active user's token inside the window", () => {
    const now = 10_000_000;
    expect(decideKeepAlive({ now, expiresAt: now + 5 * 60_000, lastActivityAt: now - 1000 })).toBe("refresh");
  });
  it("waits while the token is fresh", () => {
    const now = 10_000_000;
    expect(decideKeepAlive({ now, expiresAt: now + 50 * 60_000, lastActivityAt: now })).toBe("wait");
  });
  it("does not extend an idle tab, and expires it at exp", () => {
    const now = 10_000_000;
    const idleSince = now - sessionKeepAlive.idleLimitMs;
    expect(decideKeepAlive({ now, expiresAt: now + 60_000, lastActivityAt: idleSince })).toBe("wait");
    expect(decideKeepAlive({ now, expiresAt: now - 1, lastActivityAt: now })).toBe("expire");
  });
});
