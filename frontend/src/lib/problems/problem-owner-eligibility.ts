import type { TranslationKey } from "@/i18n/translation-key";

/**
 * W7.33 (BA-problems-15): the owner rule is evaluated on every read, so a
 * recorded owner can lose the authority *after* the assignment. The detail
 * carries the verdict and the reason; this module turns the reason into the hint
 * a screen shows. Kept beside the problem view helpers, but in its own module so
 * a page can import it without pulling the whole view layer.
 */
export type ProblemOwnerEligibilityReason =
  "inactive" | "not_manager" | "not_member" | "out_of_scope";

export type ProblemOwnerEligibility = {
  readonly eligible: boolean;
  readonly reason: ProblemOwnerEligibilityReason | null;
};

export const problemOwnerIneligibleKeys: Readonly<
  Record<ProblemOwnerEligibilityReason, TranslationKey>
> = {
  inactive: "problems.detail.ownerIneligibleReasons.inactive",
  not_manager: "problems.detail.ownerIneligibleReasons.not_manager",
  not_member: "problems.detail.ownerIneligibleReasons.not_member",
  out_of_scope: "problems.detail.ownerIneligibleReasons.out_of_scope",
};

/** A reason this client does not know still gets a hint, never a raw key. */
export function problemOwnerIneligibleKey(
  reason: ProblemOwnerEligibilityReason | null | undefined,
): TranslationKey {
  return reason === null || reason === undefined
    ? "problems.detail.ownerIneligibleUnknown"
    : problemOwnerIneligibleKeys[reason];
}
