import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
  type StoredSession,
} from "@/services/session-store";

const sampleSession: StoredSession = {
  accessToken: "signed.jwt.token",
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
});
