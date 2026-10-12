import { describe, expect, it, vi } from "vitest";
import {
  browserCanUsePasskeys,
  browserSupportsPasskeyCeremonies,
  createPasskeyCredential,
  getPasskeyAssertion,
  passkeyErrorCode,
} from "@/lib/webauthn/passkey-ceremony";

/*
  Paket 5.4.0-e: the browser half of the WebAuthn ceremonies. In a browserless
  context (this spec, and any SSR pass) every probe must answer "no" instead of
  throwing, and a ceremony call must come back as `unsupported` — a surface that
  tries to run it shows "this browser cannot do passkeys", never an exception.
*/
describe("browser capability probes", () => {
  it("reports no WebAuthn without a window (never throws)", () => {
    expect(browserSupportsPasskeyCeremonies()).toBe(false);
    expect(browserCanUsePasskeys()).toBe(false);
  });

  it("returns unsupported from both ceremonies instead of throwing", async () => {
    await expect(createPasskeyCredential({})).resolves.toEqual({ kind: "unsupported" });
    await expect(getPasskeyAssertion({})).resolves.toEqual({ kind: "unsupported" });
  });
});

describe("passkeyErrorCode", () => {
  it("extracts nothing from a plain error and never rewrites the message", () => {
    expect(passkeyErrorCode(new Error("The operation either timed out or was not allowed."))).toBeNull();
    expect(passkeyErrorCode(null)).toBeNull();
  });

  it("surfaces the platform's DOM exception name, so the UI can name the cause", () => {
    // Chrome reports a wrong RP ID/origin as a SecurityError, and an existing
    // credential on the device as an InvalidStateError.
    expect(passkeyErrorCode(new DOMException("bad rp id", "SecurityError"))).toBe("SecurityError");
    expect(passkeyErrorCode(new DOMException("already", "InvalidStateError"))).toBe("InvalidStateError");
  });
});
