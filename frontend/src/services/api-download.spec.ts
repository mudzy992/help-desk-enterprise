import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiDownloadRequest, setUnauthorizedHandler } from "./api";
import { clearStoredSession, writeStoredSession } from "./session-store";

vi.mock("@/lib/install/install-token-store", () => ({
  installTokenHeaders: (path: string) =>
    path.startsWith("/install/") ? { "X-Install-Token": "install-token" } : {},
}));

const principal = {
  subjectId: "user-1",
  email: "agent@example.test",
  displayName: "Agent",
  isLocalOnly: true,
};

/*
  Downloads go through the same request rules as JSON calls (A19): a 401 is
  judged by the same exemption lists, a caller's own Authorization header is
  respected, and install-time paths carry the install token.
*/
describe("downloads follow the request rules (A19)", () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
    writeStoredSession({ expiresAt: Date.now() + 3_600_000, principal });
    handler = vi.fn();
    setUnauthorizedHandler(handler);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    clearStoredSession();
    vi.unstubAllGlobals();
  });

  const respondWith = (status: number) => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response("denied", { status }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("ends the session on a 401 from an ordinary download", async () => {
    respondWith(401);
    await expect(apiDownloadRequest("/audit-logs/export")).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("leaves the session alone on a 401 from a confirmation path", async () => {
    respondWith(401);
    await expect(apiDownloadRequest("/security/identity/passkey/verify")).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not attach the bearer token when the caller sets Authorization", async () => {
    const fetchMock = respondWith(200);
    await apiDownloadRequest("/audit-logs/export", {
      headers: { Authorization: "Bearer other" },
    });
    const sent = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(sent.get("Authorization")).toBe("Bearer other");
    expect(sent.get("Accept")).toBe("*/*");
  });

  it("sends the install token on install paths", async () => {
    const fetchMock = respondWith(200);
    await apiDownloadRequest("/install/support-bundle");
    const sent = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(sent.get("X-Install-Token")).toBe("install-token");
  });
});
