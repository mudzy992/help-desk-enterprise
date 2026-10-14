import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredSession,
  readStoredSession,
  sessionStorageKey,
  storedSessionFrom,
  writeStoredSession,
  type StoredSession,
} from "@/services/session-store";

const sampleSession: StoredSession = {
  expiresAt: 1_900_000_000_000,
  principal: {
    subjectId: "user-1",
    email: "admin@example.com",
    displayName: "Super Admin",
    isLocalOnly: true,
  },
};

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe("session-store", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: createMemoryStorage() });
  });

  it("returns the same snapshot reference while storage is unchanged", () => {
    writeStoredSession(sampleSession);
    const first = readStoredSession();
    const second = readStoredSession();
    expect(first).toEqual(sampleSession);
    expect(second).toBe(first);
  });

  it("returns a stable null snapshot when no session is stored", () => {
    expect(readStoredSession()).toBeNull();
    expect(readStoredSession()).toBeNull();
  });

  it("clears the cached snapshot", () => {
    writeStoredSession(sampleSession);
    clearStoredSession();
    expect(readStoredSession()).toBeNull();
  });

  it("stores no token: the snapshot carries only the principal and expiry", () => {
    writeStoredSession(sampleSession);
    expect(Object.keys(readStoredSession() ?? {}).sort()).toEqual(["expiresAt", "principal"]);
  });

  it("drops a legacy entry that still holds a bearer token", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      sessionStorageKey,
      JSON.stringify({ accessToken: "legacy.jwt.token", principal: sampleSession.principal }),
    );
    vi.stubGlobal("window", { localStorage: storage });
    expect(readStoredSession()).toBeNull();
    expect(storage.getItem(sessionStorageKey)).toBeNull();
  });

  it("derives the expiry from the lifetime the API reports", () => {
    expect(
      storedSessionFrom({ expiresInSeconds: 600, principal: sampleSession.principal }, 1_000),
    ).toEqual({ expiresAt: 601_000, principal: sampleSession.principal });
  });
});
