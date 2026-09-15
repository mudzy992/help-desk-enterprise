import { ApiError } from "@/services/api";

export type RoutingErrorKey =
  | "routing.errorUnauthorized"
  | "routing.errorForbidden"
  | "routing.errorDuplicate"
  | "routing.errorReason"
  | "routing.errorGeneric";

export function mapRoutingError(error: unknown): RoutingErrorKey {
  if (!(error instanceof ApiError)) {
    return "routing.errorGeneric";
  }
  if (error.status === 401) {
    return "routing.errorUnauthorized";
  }
  if (error.status === 403 || error.code === "FORBIDDEN") {
    return "routing.errorForbidden";
  }
  if (error.code === "DUPLICATE_RULE") {
    return "routing.errorDuplicate";
  }
  if (error.code === "REASON_REQUIRED") {
    return "routing.errorReason";
  }
  return "routing.errorGeneric";
}
