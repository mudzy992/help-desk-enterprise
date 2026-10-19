import type { SignInOutcome } from "@/lib/session/use-session";
import type { MfaMethod } from "@/lib/auth/mfa-method";

export type LoginFlowStep =
  | { readonly kind: "credentials" }
  | {
      readonly kind: "change";
      readonly token: string;
      readonly reason: "temporary" | "expired";
      readonly passwordMinLength: number;
    }
  | {
      readonly kind: "mfa";
      readonly token: string;
      readonly methods?: readonly MfaMethod[];
    }
  | { readonly kind: "enroll"; readonly token: string }
  | { readonly kind: "codes"; readonly codes: readonly string[]; readonly finish: () => void };

export type LoginFlowEvent =
  | { readonly type: "OUTCOME"; readonly outcome: SignInOutcome }
  | {
      readonly type: "ENROLLMENT_CONFIRMED";
      readonly codes: readonly string[];
      readonly finish: () => void;
    }
  | { readonly type: "CANCEL" };

export function stepFromSignInOutcome(outcome: SignInOutcome): LoginFlowStep | null {
  switch (outcome.kind) {
    case "must_change_password":
      return {
        kind: "change",
        token: outcome.passwordChangeToken,
        reason: outcome.reason,
        passwordMinLength: outcome.passwordMinLength,
      };
    case "mfa_required":
      return { kind: "mfa", token: outcome.mfaToken, methods: outcome.methods };
    case "mfa_enrollment_required":
      return { kind: "enroll", token: outcome.mfaToken };
    case "authenticated":
      return null;
  }
}

export function reduceLoginFlow(_step: LoginFlowStep, event: LoginFlowEvent): LoginFlowStep {
  switch (event.type) {
    case "OUTCOME":
      return stepFromSignInOutcome(event.outcome) ?? { kind: "credentials" };
    case "ENROLLMENT_CONFIRMED":
      return { kind: "codes", codes: event.codes, finish: event.finish };
    case "CANCEL":
      return { kind: "credentials" };
  }
}

/** Accepts only a complete pending auth outcome; malformed router state starts fresh. */
export function readPendingLoginStep(state: unknown): LoginFlowStep {
  if (typeof state !== "object" || state === null || !("pendingSignIn" in state)) {
    return { kind: "credentials" };
  }
  const pending = (state as { pendingSignIn?: unknown }).pendingSignIn;
  if (typeof pending !== "object" || pending === null || !("kind" in pending)) {
    return { kind: "credentials" };
  }
  const value = pending as Record<string, unknown>;
  if (
    value.kind === "must_change_password" &&
    typeof value.passwordChangeToken === "string" &&
    (value.reason === "temporary" || value.reason === "expired") &&
    typeof value.passwordMinLength === "number"
  ) {
    return {
      kind: "change",
      token: value.passwordChangeToken,
      reason: value.reason,
      passwordMinLength: value.passwordMinLength,
    };
  }
  if (value.kind === "mfa_enrollment_required" && typeof value.mfaToken === "string") {
    return { kind: "enroll", token: value.mfaToken };
  }
  if (value.kind === "mfa_required" && typeof value.mfaToken === "string") {
    const methods = Array.isArray(value.methods)
      ? value.methods.filter(
          (method): method is MfaMethod => method === "totp" || method === "passkey",
        )
      : undefined;
    return { kind: "mfa", token: value.mfaToken, methods };
  }
  return { kind: "credentials" };
}
