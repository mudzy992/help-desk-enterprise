import { describe, expect, it } from "vitest";
import { passkeyDeviceKind, passkeyDeviceKindKey, passkeyDisplayName } from "@/lib/webauthn/aaguid";

/*
  e: the list identifies a passkey by its owner's label, else by the
  authenticator kind resolved from the AAGUID. Raw identifiers never reach the
  UI, and an unknown or missing AAGUID gets a translated generic label instead
  of a dumped GUID.
*/
describe("passkeyDeviceKind", () => {
  it("maps the common platform authenticators", () => {
    expect(passkeyDeviceKind("fbfc3007-154e-4ecc-8c0b-6e020557d7bd")).toBe("apple");
    expect(passkeyDeviceKind("08987058-cadc-4b81-b6e1-30de50dcbe96")).toBe("windows_hello");
    expect(passkeyDeviceKind("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4")).toBe("google");
    expect(passkeyDeviceKind("bada5566-a7aa-401f-bd96-45619a55120d")).toBe("android");
    expect(passkeyDeviceKind("2fc0579f-8113-47ea-b116-bb5745da8ac8")).toBe("security_key");
  });

  it("is case-insensitive and hides an unknown identifier behind the generic kind", () => {
    expect(passkeyDeviceKind("FBFC3007-154E-4ECC-8C0B-6E020557D7BD")).toBe("apple");
    expect(passkeyDeviceKind("00000000-0000-0000-0000-000000000000")).toBe("unknown");
  });

  it("treats a missing AAGUID as a roaming security key", () => {
    expect(passkeyDeviceKind(null)).toBe("security_key");
  });

  it("points every kind at a translated label", () => {
    for (const kind of [
      "apple",
      "windows_hello",
      "google",
      "android",
      "security_key",
      "unknown",
    ] as const) {
      expect(passkeyDeviceKindKey(kind)).toBe(`account.passkeys.kinds.${kind}`);
    }
  });
});

describe("passkeyDisplayName", () => {
  it("prefers the owner's label and still reports the kind", () => {
    expect(
      passkeyDisplayName({
        deviceName: "  Laptop u uredu  ",
        aaguid: "08987058-cadc-4b81-b6e1-30de50dcbe96",
      }),
    ).toEqual({ label: "Laptop u uredu", kind: "windows_hello" });
  });

  it("returns no label for a blank name, so the UI falls back to the kind", () => {
    expect(passkeyDisplayName({ deviceName: "   ", aaguid: null })).toEqual({
      label: null,
      kind: "security_key",
    });
    expect(passkeyDisplayName({ deviceName: null, aaguid: "unknown-id" })).toEqual({
      label: null,
      kind: "unknown",
    });
  });
});
