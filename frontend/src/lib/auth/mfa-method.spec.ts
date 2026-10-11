import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readPreferredMfaMethod,
  rememberPreferredMfaMethod,
  resolveDefaultMfaMethod,
} from "@/lib/auth/mfa-method";

/*
  Paket 5.4.0-e: the remembered factor is a device-local comfort setting. The
  spec pins both the storage key (a changed prefix would silently forget every
  preference) and the rule that a preference the account cannot present is
  ignored — the server's `methods` list always wins.
*/

function installStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return entries;
}

describe("mfa-method preference", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the choice under a per-address key and reads it back case-insensitively", () => {
    const entries = installStorage();
    rememberPreferredMfaMethod("Ana@Example.ORG ", "passkey");
    expect([...entries.keys()]).toEqual(["helpdesk.mfa-method:ana@example.org"]);
    expect(readPreferredMfaMethod("ana@example.org")).toBe("passkey");
    expect(readPreferredMfaMethod("ANA@EXAMPLE.ORG")).toBe("passkey");
  });

  it("treats an unknown or foreign value as no preference", () => {
    installStorage({ "helpdesk.mfa-method:ana@example.org": "sms" });
    expect(readPreferredMfaMethod("ana@example.org")).toBeNull();
    expect(readPreferredMfaMethod("someone-else@example.org")).toBeNull();
  });

  it("never throws when the browser refuses storage (private mode)", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("storage disabled");
      },
    });
    expect(readPreferredMfaMethod("ana@example.org")).toBeNull();
    expect(() => rememberPreferredMfaMethod("ana@example.org", "totp")).not.toThrow();
  });

  it("has no preference in a browserless context", () => {
    expect(readPreferredMfaMethod("ana@example.org")).toBeNull();
  });
});

describe("resolveDefaultMfaMethod", () => {
  it("keeps TOTP when the server does not announce methods (older server)", () => {
    expect(resolveDefaultMfaMethod(undefined, null)).toBe("totp");
    expect(resolveDefaultMfaMethod(undefined, "passkey")).toBe("totp");
    expect(resolveDefaultMfaMethod([], null)).toBe("totp");
  });

  it("prefers the remembered factor only while the account still offers it", () => {
    expect(resolveDefaultMfaMethod(["totp", "passkey"], "passkey")).toBe("passkey");
    expect(resolveDefaultMfaMethod(["totp", "passkey"], "totp")).toBe("totp");
    expect(resolveDefaultMfaMethod(["totp"], "passkey")).toBe("totp");
  });

  it("falls back to the first factor the server announced", () => {
    expect(resolveDefaultMfaMethod(["passkey", "totp"], null)).toBe("passkey");
  });
});
