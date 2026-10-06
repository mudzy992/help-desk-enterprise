import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { readPasswordFeedbackKeys } from "@/components/auth/password-feedback";

/*
  Paket 5.1 (M1 #1): the install wizard reports the broken password rules under
  its own code (`PASSWORD_POLICY_VIOLATIONS`), while the forced-change flow uses
  `INVALID_PASSWORD`. Both screens share this mapping, so `password12345` no
  longer slips through the founder account with a vague message.
*/
describe("readPasswordFeedbackKeys", () => {
  const failure = (code: string, details: Record<string, unknown> | null) =>
    new ApiError(400, code, "Password rejected", null, details);

  it("maps each reported rule to its own message key", () => {
    expect(
      readPasswordFeedbackKeys(
        failure("PASSWORD_POLICY_VIOLATIONS", {
          violations: ["TOO_SHORT", "COMMON_PASSWORD"],
        }),
      ),
    ).toEqual(["auth.passwordPolicy.TOO_SHORT", "auth.passwordPolicy.COMMON_PASSWORD"]);
  });

  it("keeps the forced-change code working", () => {
    expect(
      readPasswordFeedbackKeys(
        failure("INVALID_PASSWORD", { violations: ["CONTAINS_EMAIL_NAME"] }),
      ),
    ).toEqual(["auth.passwordPolicy.CONTAINS_EMAIL_NAME"]);
  });

  it("falls back to a generic rule message when nothing is listed", () => {
    expect(readPasswordFeedbackKeys(failure("PASSWORD_POLICY_VIOLATIONS", null))).toEqual([
      "auth.passwordPolicy.generic",
    ]);
    expect(
      readPasswordFeedbackKeys(failure("PASSWORD_POLICY_VIOLATIONS", { violations: ["NOT_A_RULE"] })),
    ).toEqual(["auth.passwordPolicy.generic"]);
  });

  it("still names reuse and a wrong current password", () => {
    expect(readPasswordFeedbackKeys(failure("PASSWORD_REUSED", null))).toEqual([
      "auth.passwordPolicy.reused",
    ]);
    expect(readPasswordFeedbackKeys(failure("CURRENT_PASSWORD_INVALID", null))).toEqual([
      "auth.passwordPolicy.currentInvalid",
    ]);
  });

  it("ignores failures that are not about the password rules", () => {
    expect(readPasswordFeedbackKeys(failure("SUPER_ADMIN_EMAIL_TAKEN", null))).toBeNull();
    expect(readPasswordFeedbackKeys(new Error("network"))).toBeNull();
  });
});
