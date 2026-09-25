import { afterEach, describe, expect, it, vi } from "vitest";
import { clearInstallToken, installTokenHeaders, writeInstallToken } from "./install-token-store";

function stubSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

describe("install token store (review S4)", () => {
  afterEach(() => {
    clearInstallToken();
    vi.unstubAllGlobals();
  });

  it("sends the token only on /install/ requests", () => {
    stubSessionStorage();
    expect(installTokenHeaders("/install/seed")).toEqual({});
    writeInstallToken("  secret-token-value  ");
    expect(installTokenHeaders("/install/seed")).toEqual({ "X-Install-Token": "secret-token-value" });
    expect(installTokenHeaders("/tickets")).toEqual({});
  });

  it("is a no-op without a browser", () => {
    expect(installTokenHeaders("/install/seed")).toEqual({});
  });
});
