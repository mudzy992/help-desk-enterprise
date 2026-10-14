import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { mapMfaCodeError, mapMfaEnrollmentLoadError } from "./map-mfa-step-error";

describe("MFA intermediate-step error mapping (5.2.1 M2 #5)", () => {
  it("uses the shared expired-sign-in message for invalid or expired MFA tokens", () => {
    const error = new ApiError(401, "INVALID_CREDENTIALS", "raw backend detail");
    expect(mapMfaCodeError(error)).toBe("signInExpired");
    expect(mapMfaEnrollmentLoadError(error)).toBe("signInExpired");
  });

  it("keeps actual code, enrollment and rate-limit errors distinct", () => {
    expect(mapMfaCodeError(new ApiError(401, "MFA_INVALID_CODE", "invalid"))).toBe("invalid");
    expect(mapMfaCodeError(new ApiError(400, "MFA_ENROLLMENT_EXPIRED", "expired"))).toBe("expired");
    expect(mapMfaCodeError(new ApiError(429, "MFA_TOO_MANY_ATTEMPTS", "limited"))).toBe(
      "rateLimited",
    );
    expect(mapMfaCodeError(new ApiError(401, "MFA_RECOVERY_CODES_EXHAUSTED", "empty"))).toBe(
      "recoveryCodesExhausted",
    );
    expect(mapMfaEnrollmentLoadError(new ApiError(503, "MFA_UNAVAILABLE", "unavailable"))).toBe(
      "unavailable",
    );
  });

  it("explains that a required second factor cannot be switched off (A25)", () => {
    expect(mapMfaCodeError(new ApiError(403, "MFA_REQUIRED_CANNOT_DISABLE", "required"))).toBe(
      "mfaRequired",
    );
  });

  it("never surfaces raw server details for an unrecognized failure", () => {
    expect(mapMfaCodeError(new Error("sensitive backend details"))).toBe("failed");
    expect(mapMfaEnrollmentLoadError(new Error("sensitive backend details"))).toBe("failed");
  });

  it("maps the human-check codes before the generic 400 (5.4.1 closeout)", () => {
    expect(mapMfaCodeError(new ApiError(400, "CAPTCHA_REQUIRED", "required"))).toBe(
      "captchaRequired",
    );
    expect(mapMfaCodeError(new ApiError(400, "CAPTCHA_FAILED", "failed"))).toBe("captchaFailed");
  });
});
