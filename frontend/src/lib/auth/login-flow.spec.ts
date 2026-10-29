import { describe, expect, it, vi } from "vitest";
import {
  readPendingLoginStep,
  reduceLoginFlow,
  stepFromSignInOutcome,
  type LoginFlowStep,
} from "@/lib/auth/login-flow";

const credentials: LoginFlowStep = { kind: "credentials" };

describe("login flow", () => {
  it("maps every pending server outcome to one typed step", () => {
    expect(
      stepFromSignInOutcome({
        kind: "must_change_password",
        passwordChangeToken: "password-token",
        expiresInSeconds: 300,
        reason: "expired",
        passwordMinLength: 14,
      }),
    ).toEqual({
      kind: "change",
      token: "password-token",
      reason: "expired",
      passwordMinLength: 14,
    });
    expect(
      stepFromSignInOutcome({
        kind: "mfa_required",
        mfaToken: "mfa-token",
        methods: ["totp", "passkey"],
      }),
    ).toEqual({ kind: "mfa", token: "mfa-token", methods: ["totp", "passkey"] });
    expect(
      stepFromSignInOutcome({ kind: "mfa_enrollment_required", mfaToken: "enroll-token" }),
    ).toEqual({ kind: "enroll", token: "enroll-token" });
    expect(stepFromSignInOutcome({ kind: "authenticated" })).toBeNull();
  });

  it("replaces a sensitive token instead of carrying it into the next step", () => {
    const changing: LoginFlowStep = {
      kind: "change",
      token: "old-password-token",
      reason: "temporary",
      passwordMinLength: 12,
    };
    const next = reduceLoginFlow(changing, {
      type: "OUTCOME",
      outcome: { kind: "mfa_required", mfaToken: "new-mfa-token", methods: ["totp"] },
    });

    expect(next).toEqual({ kind: "mfa", token: "new-mfa-token", methods: ["totp"] });
    expect(JSON.stringify(next)).not.toContain("old-password-token");
  });

  it("moves enrollment to one-time recovery codes and cancellation clears the flow", () => {
    const finish = vi.fn();
    const codes = reduceLoginFlow(
      { kind: "enroll", token: "enroll-token" },
      {
        type: "ENROLLMENT_CONFIRMED",
        codes: ["recovery-1"],
        finish,
      },
    );
    expect(codes).toEqual({ kind: "codes", codes: ["recovery-1"], finish });

    const cancelled = reduceLoginFlow(codes, { type: "CANCEL" });
    expect(cancelled).toEqual(credentials);
    expect(JSON.stringify(cancelled)).not.toContain("recovery-1");
  });

  it("accepts complete router handoff state and rejects malformed sensitive state", () => {
    expect(
      readPendingLoginStep({
        pendingSignIn: { kind: "mfa_required", mfaToken: "mfa-token", methods: ["passkey"] },
      }),
    ).toEqual({ kind: "mfa", token: "mfa-token", methods: ["passkey"] });
    expect(readPendingLoginStep({ pendingSignIn: { kind: "mfa_required" } })).toEqual(credentials);
    expect(readPendingLoginStep({ pendingSignIn: { kind: "unknown", token: "unsafe" } })).toEqual(
      credentials,
    );
  });
});
