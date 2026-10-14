import { ApiError } from "@/services/api";

export type MfaCodeError =
  | "invalid"
  | "rateLimited"
  | "expired"
  | "signInExpired"
  | "recoveryCodesExhausted"
  | "mfaRequired"
  | "captchaRequired"
  | "captchaFailed"
  | "failed";

export type MfaEnrollmentLoadError = "unavailable" | "signInExpired" | "failed";

/** Shared sign-in/enrollment mapping; never displays raw server error text. */
export function mapMfaCodeError(error: unknown): MfaCodeError {
  // Checked before the 400 branch below: a missing or refused human check is a 400 too.
  if (error instanceof ApiError && error.code === "CAPTCHA_REQUIRED") return "captchaRequired";
  if (error instanceof ApiError && error.code === "CAPTCHA_FAILED") return "captchaFailed";
  if (error instanceof ApiError && error.status === 429) return "rateLimited";
  if (error instanceof ApiError && error.code === "MFA_ENROLLMENT_EXPIRED") return "expired";
  if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") return "signInExpired";
  if (error instanceof ApiError && error.code === "MFA_RECOVERY_CODES_EXHAUSTED") {
    return "recoveryCodesExhausted";
  }
  // The account policy requires a second factor, so it cannot be switched off.
  if (error instanceof ApiError && error.code === "MFA_REQUIRED_CANNOT_DISABLE") {
    return "mfaRequired";
  }
  if (error instanceof ApiError && (error.status === 401 || error.status === 400)) return "invalid";
  return "failed";
}

export function mapMfaEnrollmentLoadError(error: unknown): MfaEnrollmentLoadError {
  if (error instanceof ApiError && error.code === "MFA_UNAVAILABLE") return "unavailable";
  if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") return "signInExpired";
  return "failed";
}
