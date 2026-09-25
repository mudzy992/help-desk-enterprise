import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, setUnauthorizedHandler } from "./api";
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
