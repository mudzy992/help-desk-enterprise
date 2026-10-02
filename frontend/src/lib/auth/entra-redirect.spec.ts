import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetEntraConfiguration,
  readRememberedEntraConfiguration,
  rememberEntraConfiguration,
  safeReturnPath,
} from "./entra-redirect";

describe("safeReturnPath (paket 1.8)", () => {
  it("keeps in-app relative paths", () => {
    expect(safeReturnPath("/tickets/abc?view=all")).toBe("/tickets/abc?view=all");
  });

  it("rejects absolute, protocol-relative and loop targets", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/auth/callback")).toBe("/");
    expect(safeReturnPath("/login")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
  });
});

/*
  Paket 4.1a (E2): the hand-off between the sign-in start and the callback page
  lives in sessionStorage under the neutral `service-desk.*` key. The callback
  page falls back to `GET /auth/providers`, so there is no migration table.
*/
describe("entra configuration hand-off (paket 4.1a E2)", () => {
  const configuration = {
    tenantId: "tenant-id",
    clientId: "client-id",
    authority: "https://login.microsoftonline.com/tenant-id",
    singleLogout: true,
  } as const;

  function createMemoryStorage(): Storage {
    const store: Record<string, string> = {};
    return {
      get length() {
        return Object.keys(store).length;
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
      getItem: (key: string) => (key in store ? store[key] : null),
      key: (index: number) => Object.keys(store)[index] ?? null,
      removeItem: (key: string) => {
        delete store[key];
      },
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
    } as Storage;
  }

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the hand-off under the neutral service-desk key", () => {
    rememberEntraConfiguration(configuration);
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.key(0)).toBe("service-desk.entra.configuration");
  });

  it("round-trips the configuration and forgets it after the callback", () => {
    rememberEntraConfiguration(configuration);
    expect(readRememberedEntraConfiguration()).toEqual(configuration);
    forgetEntraConfiguration();
    expect(sessionStorage.length).toBe(0);
    expect(readRememberedEntraConfiguration()).toBeNull();
  });

  it("ignores stored values without clientId and authority", () => {
    sessionStorage.setItem("service-desk.entra.configuration", JSON.stringify({ tenantId: "t" }));
    expect(readRememberedEntraConfiguration()).toBeNull();
  });
});
