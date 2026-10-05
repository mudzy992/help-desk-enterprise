import { ApiError } from "@/services/api";

export type PolicyPacksMessageKey =
  | "policyPacks.errorForbidden"
  | "policyPacks.errorNotFound"
  | "policyPacks.errorValidation"
  /** M5 B3: the client-side check — the target must be an OU, a service or both. */
  | "policyPacks.errorTargetRequired"
  /** M5 B6: apply is refused until the admin has seen the plan for this target. */
  | "policyPacks.errorValidationRequired"
  | "policyPacks.errorGeneric";

export function mapPolicyPacksError(error: unknown): PolicyPacksMessageKey {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "policyPacks.errorForbidden";
    }
    if (error.status === 404) {
      return "policyPacks.errorNotFound";
    }
    if (error.status === 400) {
      return "policyPacks.errorValidation";
    }
  }
  return "policyPacks.errorGeneric";
}
