import { ApiError } from "@/services/api";

export type SlaErrorKey =
  | "sla.errorUnauthorized"
  | "sla.errorForbidden"
  | "sla.errorReason"
  | "sla.errorDuplicate"
  | "sla.errorOverlap"
  | "sla.errorInUse"
  | "sla.errorMaxEscalationLevels"
  | "sla.errorGeneric";

export function mapSlaError(error: unknown): SlaErrorKey {
  if (!(error instanceof ApiError)) {
    return "sla.errorGeneric";
  }
  if (error.status === 401) {
    return "sla.errorUnauthorized";
  }
  if (error.status === 403 || error.code === "FORBIDDEN") {
    return "sla.errorForbidden";
  }
  if (error.code === "REASON_REQUIRED") {
    return "sla.errorReason";
  }
  if (error.code === "DUPLICATE_KEY" || error.code === "DUPLICATE_RULE" || error.code === "DUPLICATE_ESCALATION_OFFSET") {
    return "sla.errorDuplicate";
  }
  if (error.code === "MAX_ESCALATION_LEVELS_EXCEEDED") {
    return "sla.errorMaxEscalationLevels";
  }
  if (error.code === "OVERLAPPING_INTERVALS" || error.code === "INVALID_WEEKLY_HOURS") {
    return "sla.errorOverlap";
  }
  if (error.code === "CALENDAR_IN_USE" || error.code === "PROFILE_IN_USE") {
    return "sla.errorInUse";
  }
  return "sla.errorGeneric";
}
