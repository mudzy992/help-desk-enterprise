import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { ceremonyMessageKey, passkeyMessageKey } from "@/lib/webauthn/passkey-errors";

/*
  Paket 5.4.0-e: every passkey failure must end in one of the translated
  `account.passkeys.error*` messages — an unmapped code falls back to the
  generic message and never surfaces a raw server code or a platform exception
  string to the user.
*/
describe("passkeyMessageKey", () => {
  it("maps the domain codes the server answers with", () => {
    expect(passkeyMessageKey(new ApiError(400, "PASSKEY_INVALID_NAME", "x"))).toBe(
      "account.passkeys.errorInvalidName",
    );
    expect(passkeyMessageKey(new ApiError(404, "PASSKEY_NOT_FOUND", "x"))).toBe(
      "account.passkeys.errorNotFound",
    );
    expect(passkeyMessageKey(new ApiError(409, "MFA_REQUIRED_CANNOT_DISABLE", "x"))).toBe(
      "account.passkeys.errorLastFactor",
    );
    expect(passkeyMessageKey(new ApiError(401, "MFA_INVALID_CODE", "x"))).toBe(
      "account.passkeys.errorInvalidCode",
    );
    expect(passkeyMessageKey(new ApiError(503, "MFA_UNAVAILABLE", "x"))).toBe(
      "account.passkeys.errorNotAvailable",
    );
    // Review 2026-10-12: a refused attestation has its own 400 code; the dialog
    // explains what to check instead of repeating "the code is not valid".
    expect(passkeyMessageKey(new ApiError(400, "PASSKEY_VERIFICATION_FAILED", "x"))).toBe(
      "account.passkeys.errorRejected",
    );
  });

  it("falls back by status and finally to the generic message", () => {
    expect(passkeyMessageKey(new ApiError(429, "RATE_LIMITED", "x"))).toBe(
      "account.passkeys.errorRateLimited",
    );
    expect(passkeyMessageKey(new ApiError(500, "WHATEVER", "x"))).toBe(
      "account.passkeys.errorGeneric",
    );
    expect(passkeyMessageKey(new Error("WebAuthn blew up"))).toBe("account.passkeys.errorGeneric");
    expect(passkeyMessageKey(null)).toBe("account.passkeys.errorGeneric");
  });
});

describe("ceremonyMessageKey", () => {
  it("names an unsupported browser", () => {
    expect(ceremonyMessageKey({ kind: "unsupported" })).toBe("account.passkeys.errorUnsupported");
  });

  it("turns the platform's own exception names into an actionable sentence", () => {
    // RP ID/origin mismatch or a non-secure context: only the deployment can fix it.
    expect(ceremonyMessageKey({ kind: "failed", code: "SecurityError" })).toBe(
      "account.passkeys.errorConfig",
    );
    expect(ceremonyMessageKey({ kind: "failed", code: "InvalidStateError" })).toBe(
      "account.passkeys.errorAlreadyRegistered",
    );
    expect(ceremonyMessageKey({ kind: "failed", code: "NotSupportedError" })).toBe(
      "account.passkeys.errorUnsupported",
    );
    expect(ceremonyMessageKey({ kind: "failed", code: "ConstraintError" })).toBe(
      "account.passkeys.errorConstraint",
    );
    expect(ceremonyMessageKey({ kind: "failed", code: "UnknownError" })).toBe(
      "account.passkeys.errorGeneric",
    );
  });

  it("explains an already-registered authenticator and a refused user verification", () => {
    expect(
      ceremonyMessageKey({ kind: "failed", code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" }),
    ).toBe("account.passkeys.errorAlreadyRegistered");
    expect(
      ceremonyMessageKey({ kind: "failed", code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE" }),
    ).toBe("account.passkeys.errorDevice");
    expect(ceremonyMessageKey({ kind: "failed", code: "SOMETHING_ELSE" })).toBe(
      "account.passkeys.errorGeneric",
    );
    expect(ceremonyMessageKey({ kind: "failed", code: null })).toBe(
      "account.passkeys.errorGeneric",
    );
  });
});
