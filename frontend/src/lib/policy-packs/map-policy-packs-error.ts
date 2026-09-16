import { ApiError } from "@/services/api";

export type PolicyPacksMessageKey =
  | "policyPacks.errorForbidden"
  | "policyPacks.errorNotFound"
  | "policyPacks.errorValidation"
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
