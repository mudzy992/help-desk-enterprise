import { ApiError } from "@/services/api";

/**
 * Paket 5.4.0-e: one place where a passkey failure becomes a message. The
 * server answers with domain codes (`MFA_NOT_AVAILABLE`, `PASSKEY_NOT_FOUND`,
 * `MFA_REQUIRED_CANNOT_DISABLE`, …) and the platform adds its own WebAuthn
 * error codes; both are mapped here so every passkey screen says the same
 * thing for the same cause.
 */

export type PasskeyMessageKey =
  | "account.passkeys.errorUnsupported"
  | "account.passkeys.errorCancelled"
  | "account.passkeys.errorDevice"
  | "account.passkeys.errorAlreadyRegistered"
  | "account.passkeys.errorNotAvailable"
  | "account.passkeys.errorNotFound"
  | "account.passkeys.errorLastFactor"
  | "account.passkeys.errorInvalidName"
  | "account.passkeys.errorInvalidCode"
  | "account.passkeys.errorExpired"
  | "account.passkeys.errorRateLimited"
  | "account.passkeys.errorGeneric";

const codes: Readonly<Record<string, PasskeyMessageKey>> = {
  MFA_NOT_AVAILABLE: "account.passkeys.errorNotAvailable",
  MFA_UNAVAILABLE: "account.passkeys.errorNotAvailable",
  MFA_REQUIRED_CANNOT_DISABLE: "account.passkeys.errorLastFactor",
  PASSKEY_NOT_FOUND: "account.passkeys.errorNotFound",
  PASSKEY_INVALID_NAME: "account.passkeys.errorInvalidName",
  PASSKEY_CLONED: "account.passkeys.errorDevice",
  MFA_INVALID_CODE: "account.passkeys.errorInvalidCode",
  MFA_RECOVERY_CODES_EXHAUSTED: "account.passkeys.errorInvalidCode",
  MFA_ENROLLMENT_EXPIRED: "account.passkeys.errorExpired",
  MFA_TOO_MANY_ATTEMPTS: "account.passkeys.errorRateLimited",
  SESSION_NOT_FOUND: "account.passkeys.errorGeneric",
  IDENTITY_CONFIRMATION_REQUIRED: "account.passkeys.errorGeneric",
  IDENTITY_CONFIRMATION_FAILED: "account.passkeys.errorDevice",
};

export function passkeyMessageKey(error: unknown): PasskeyMessageKey {
  if (error instanceof ApiError) {
    const mapped = codes[error.code];
    if (mapped !== undefined) {
      return mapped;
    }
    if (error.status === 429) return "account.passkeys.errorRateLimited";
    if (error.status === 401) return "account.passkeys.errorDevice";
    return "account.passkeys.errorGeneric";
  }
  return "account.passkeys.errorGeneric";
}

/** A ceremony that the platform refused before it reached the server. */
export function ceremonyMessageKey(
  result: { readonly kind: "failed"; readonly code: string | null } | { readonly kind: "unsupported" },
): PasskeyMessageKey {
  if (result.kind === "unsupported") return "account.passkeys.errorUnsupported";
  if (result.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "account.passkeys.errorAlreadyRegistered";
  }
  if (
    result.code === "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT" ||
    result.code === "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE"
  ) {
    return "account.passkeys.errorDevice";
  }
  return "account.passkeys.errorGeneric";
}
