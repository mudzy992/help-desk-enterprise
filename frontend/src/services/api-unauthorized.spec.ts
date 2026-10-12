import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, isConfirmationUnauthorizedPath, setUnauthorizedHandler } from "./api";
import { clearStoredSession, writeStoredSession } from "./session-store";

function stubWindow() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

describe("global 401 handling (review 2026-09-25, S10)", () => {
  afterEach(() => {
    setUnauthorizedHandler(null);
    clearStoredSession();
    vi.unstubAllGlobals();
    clearStoredSession();
  });
  const respond = (status: number) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "X" }), { status })));
  const signIn = () => {
    stubWindow();
    writeStoredSession({
      accessToken: "t",
      principal: { subjectId: "u", email: "e", displayName: "d", isLocalOnly: true },
    });
  };

  it("calls the handler on 401 for an authenticated request", async () => {
    signIn();
    respond(401);
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(apiRequest("/tickets")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("ignores a wrong password on /auth/login and 403s", async () => {
    signIn();
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(401);
    await expect(apiRequest("/auth/login", { method: "POST" })).rejects.toThrow();
    respond(403);
    await expect(apiRequest("/tickets")).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

/*
  Review 2026-10-12 (5.4.0-e, live test): the second factor answers 401 for a
  rejected confirmation (`MFA_INVALID_CODE`, `IDENTITY_CONFIRMATION_FAILED`).
  The shared api client used to read every authenticated 401 as "session
  ended" and cleared the session — a mistyped code or a refused passkey signed
  the person out in the middle of the dialog that was supposed to explain the
  failure. These paths keep their 401 as a domain answer; everything else still
  ends the session (the block above pins exactly that).
*/
describe("isConfirmationUnauthorizedPath (review 2026-10-12)", () => {
  it("keeps the session for the sensitive-action confirmations", () => {
    expect(isConfirmationUnauthorizedPath("/auth/security/passkey/register/confirm")).toBe(true);
    expect(isConfirmationUnauthorizedPath("/auth/security/mfa/disable")).toBe(true);
    expect(isConfirmationUnauthorizedPath("/auth/security/mfa/recovery-codes")).toBe(true);
    expect(isConfirmationUnauthorizedPath("/security/identity/passkey/start")).toBe(true);
    expect(isConfirmationUnauthorizedPath("/security/identity/passkey/verify")).toBe(true);
    expect(isConfirmationUnauthorizedPath("/security/rate-limits")).toBe(true);
    expect(isConfirmationUnauthorizedPath("/security/bulk-password-reset")).toBe(true);
  });

  it("keeps the pre-existing sessionless paths sessionless", () => {
    expect(isConfirmationUnauthorizedPath("/auth/login")).toBe(true);
    expect(isConfirmationUnauthorizedPath("/auth/change-password")).toBe(true);
    expect(isConfirmationUnauthorizedPath("/install/status")).toBe(true);
  });

  it("still lets a genuinely lost session end the session", () => {
    expect(isConfirmationUnauthorizedPath("/auth/security")).toBe(false);
    expect(isConfirmationUnauthorizedPath("/auth/security/passkey/register/start")).toBe(false);
    expect(isConfirmationUnauthorizedPath("/tickets")).toBe(false);
    expect(isConfirmationUnauthorizedPath("/auth/sessions")).toBe(false);
  });

  it("does not end the session when the confirmation itself is rejected", async () => {
    stubWindow();
    writeStoredSession({
      accessToken: "t",
      principal: { subjectId: "u", email: "e", displayName: "d", isLocalOnly: true },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "MFA_INVALID_CODE" }), { status: 401 })));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(
      apiRequest("/auth/security/passkey/register/confirm", { method: "POST" }),
    ).rejects.toMatchObject({ status: 401, code: "MFA_INVALID_CODE" });
    expect(handler).not.toHaveBeenCalled();
  });
});
