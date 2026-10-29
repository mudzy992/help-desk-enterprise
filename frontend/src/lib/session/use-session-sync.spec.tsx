// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { helpdeskQueryClient } from "@/lib/query/query-client";
import { useSession } from "@/lib/session/use-session";
import { loginWithPassword, logoutSession } from "@/services/auth-api";
import { sessionStorageKey, writeStoredSession } from "@/services/session-store";

vi.mock("@/services/auth-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/auth-api")>();
  return {
    ...actual,
    loginWithPassword: vi.fn(),
    logoutSession: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("@/lib/auth/entra-redirect", () => ({
  forgetEntraConfiguration: vi.fn(),
  signOutOfEntra: vi.fn(() => Promise.resolve()),
}));

const principal = {
  subjectId: "user-1",
  email: "agent@example.test",
  displayName: "Agent",
  isLocalOnly: true,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("session changes made in another tab ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logoutSession).mockResolvedValue();
    vi.mocked(loginWithPassword).mockResolvedValue({
      expiresInSeconds: 3_600,
      principal: { ...principal, subjectId: "user-2" },
    });
    window.localStorage.clear();
    helpdeskQueryClient.clear();
    writeStoredSession({ expiresAt: Date.now() + 3_600_000, principal });
  });

  afterEach(() => {
    helpdeskQueryClient.clear();
  });

  it("ends the session here when another tab removed it", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.session).not.toBeNull();

    act(() => {
      window.localStorage.removeItem(sessionStorageKey);
      window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey }));
    });

    expect(result.current.session).toBeNull();
  });

  it("drops cached answers when the session disappears in another tab", () => {
    renderHook(() => useSession());
    helpdeskQueryClient.setQueryData(["tickets", "list", {}], { items: [] });

    act(() => {
      window.localStorage.removeItem(sessionStorageKey);
      window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey }));
    });

    expect(helpdeskQueryClient.getQueryData(["tickets", "list", {}])).toBeUndefined();
  });

  it("drops the previous user's cache when another tab changes identity", () => {
    const { result } = renderHook(() => useSession());
    helpdeskQueryClient.setQueryData(["tickets", "list", {}], { items: ["private"] });

    act(() => {
      writeStoredSession({
        expiresAt: Date.now() + 3_600_000,
        principal: {
          subjectId: "user-2",
          email: "other@example.test",
          displayName: "Other user",
          isLocalOnly: false,
        },
      });
      window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey }));
    });

    expect(result.current.session?.principal.subjectId).toBe("user-2");
    expect(helpdeskQueryClient.getQueryData(["tickets", "list", {}])).toBeUndefined();
  });

  it("keeps cached answers when the same identity only receives a new expiry", () => {
    renderHook(() => useSession());
    helpdeskQueryClient.setQueryData(["tickets", "list", {}], { items: ["same-user"] });

    act(() => {
      writeStoredSession({ expiresAt: Date.now() + 7_200_000, principal });
      window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey }));
    });

    expect(helpdeskQueryClient.getQueryData(["tickets", "list", {}])).toEqual({
      items: ["same-user"],
    });
  });

  it("ignores storage events for other keys", () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    });

    expect(result.current.session).not.toBeNull();
  });

  it("clears cached answers on sign-out", () => {
    const { result } = renderHook(() => useSession());
    helpdeskQueryClient.setQueryData(["tickets", "list", {}], { items: [] });

    act(() => {
      result.current.signOut();
    });

    expect(logoutSession).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(helpdeskQueryClient.getQueryData(["tickets", "list", {}])).toBeUndefined();
  });

  it("waits for server logout before a fast subsequent sign-in", async () => {
    const logout = deferred<void>();
    vi.mocked(logoutSession).mockReturnValueOnce(logout.promise);
    const { result } = renderHook(() => useSession());

    act(() => result.current.signOut());
    const signIn = result.current.signIn("other@example.test", "password");
    await Promise.resolve();

    expect(result.current.session).toBeNull();
    expect(loginWithPassword).not.toHaveBeenCalled();

    logout.resolve(undefined);
    await act(async () => {
      await signIn;
    });

    expect(loginWithPassword).toHaveBeenCalledOnce();
    expect(result.current.session?.principal.subjectId).toBe("user-2");
  });

  it("aborts a stalled logout before allowing sign-in", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(logoutSession).mockImplementationOnce(() => new Promise(() => undefined));
      const { result } = renderHook(() => useSession());

      act(() => result.current.signOut());
      const signal = vi.mocked(logoutSession).mock.calls[0]?.[0];
      const signIn = result.current.signIn("other@example.test", "password");

      expect(loginWithPassword).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2_000);
      await act(async () => {
        await signIn;
      });

      expect(signal?.aborted).toBe(true);
      expect(loginWithPassword).toHaveBeenCalledOnce();
      expect(result.current.session?.principal.subjectId).toBe("user-2");
    } finally {
      vi.useRealTimers();
    }
  });
});
