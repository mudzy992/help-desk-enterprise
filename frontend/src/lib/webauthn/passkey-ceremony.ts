import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnError,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";

/**
 * Paket 5.4.0-e: the browser half of the WebAuthn ceremonies. Everything the
 * UI needs from the platform lives here, so a component never touches the
 * library directly and the flow stays testable:
 *
 *   registration   start → confirm   (profile: "Dodaj passkey")
 *   login          start → verify    (sign-in second factor)
 *   step-up        start → verify    (sensitive action confirmation)
 *
 * The server owns every security decision (challenge, origin, RP ID, counter);
 * this module only converts the JSON options to a platform call and hands the
 * attestation/assertion back. A user who closes the system prompt produces
 * `cancelled` — never an error toast.
 */

export type PasskeyCeremonyResult<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "cancelled" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "failed"; readonly code: string | null };

export function browserCanUsePasskeys(): boolean {
  try {
    return browserSupportsWebAuthn() && platformAuthenticatorIsAvailable() !== null;
  } catch {
    // A browser without WebAuthn throws on the helpers.
    return false;
  }
}

/** True when WebAuthn exists at all (a roaming security key is enough). */
export function browserSupportsPasskeyCeremonies(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

function isCancellation(error: unknown): boolean {
  if (error instanceof WebAuthnError) {
    return error.code === "ERROR_CEREMONY_ABORTED";
  }
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "AbortError";
  }
  return error instanceof Error && error.name === "NotAllowedError";
}

/**
 * The platform reports the interesting failures as DOM exceptions, not as
 * library errors: `SecurityError` means the RP ID/origin pair is wrong (a
 * configuration bug), `InvalidStateError` means a passkey already exists on
 * this device, `NotSupportedError` means no usable algorithm/authenticator.
 * Without the name the UI could only say "something failed" — which is what a
 * live attempt on a phone/QR flow showed (review 2026-10-12).
 */
export function passkeyErrorCode(error: unknown): string | null {
  if (error instanceof WebAuthnError) return error.code;
  if (error instanceof DOMException) return error.name;
  return null;
}

function toResult<T>(error: unknown): PasskeyCeremonyResult<T> {
  if (isCancellation(error)) {
    return { kind: "cancelled" };
  }
  return { kind: "failed", code: passkeyErrorCode(error) };
}

export async function createPasskeyCredential(
  options: Record<string, unknown>,
): Promise<PasskeyCeremonyResult<RegistrationResponseJSON>> {
  if (!browserSupportsPasskeyCeremonies()) {
    return { kind: "unsupported" };
  }
  try {
    const value = await startRegistration({
      optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
    return { kind: "ok", value };
  } catch (error) {
    return toResult<RegistrationResponseJSON>(error);
  }
}

export async function getPasskeyAssertion(
  options: Record<string, unknown>,
): Promise<PasskeyCeremonyResult<AuthenticationResponseJSON>> {
  if (!browserSupportsPasskeyCeremonies()) {
    return { kind: "unsupported" };
  }
  try {
    const value = await startAuthentication({
      optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
    });
    return { kind: "ok", value };
  } catch (error) {
    return toResult<AuthenticationResponseJSON>(error);
  }
}
