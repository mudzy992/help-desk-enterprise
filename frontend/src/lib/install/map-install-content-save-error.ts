import { ApiError } from "@/services/api";

/**
 * Install wizard v2 (F4): the three content steps answer with the codes their
 * services map (`BLUEPRINT_*`, `PACK_*`, `SLA_REVIEW_*`). The wizard shows one
 * sentence per situation the operator can act on and the generic one otherwise —
 * the raw code never reaches the screen.
 */
export type InstallContentErrorKey =
  | "install.blueprint.errorStructure"
  | "install.blueprint.errorRouting"
  | "install.policyPack.errorDisabled"
  | "install.policyPack.errorNotOffered"
  | "install.policyPack.errorUnknown"
  | "install.slaReview.errorEmpty"
  | "install.slaReview.errorCalendarMissing"
  | "install.slaReview.errorHours"
  | "install.content.errorSuperAdmin"
  | "install.content.errorGeneric";

export function mapInstallContentSaveError(error: unknown): InstallContentErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.content.errorGeneric";
  }
  switch (error.code) {
    case "BLUEPRINT_STRUCTURE_REQUIRED":
      return "install.blueprint.errorStructure";
    case "BLUEPRINT_ROUTING_UNRESOLVED":
      return "install.blueprint.errorRouting";
    case "PACK_DISABLED":
      return "install.policyPack.errorDisabled";
    case "POLICY_PACK_NOT_OFFERED":
      return "install.policyPack.errorNotOffered";
    case "POLICY_PACK_UNKNOWN":
      return "install.policyPack.errorUnknown";
    case "SLA_REVIEW_EMPTY_ADJUSTMENT":
      return "install.slaReview.errorEmpty";
    case "SLA_REVIEW_CALENDAR_MISSING":
      return "install.slaReview.errorCalendarMissing";
    // The SLA domain keeps validating the week itself; the wizard only has to say
    // that the hours it was handed are not usable.
    case "OVERLAPPING_INTERVALS":
    case "INVALID_WEEKLY_HOURS":
    case "CALENDAR_HAS_NO_BUSINESS_HOURS":
    case "CALENDAR_IN_USE":
      return "install.slaReview.errorHours";
    case "SUPER_ADMIN_REQUIRED":
      return "install.content.errorSuperAdmin";
    default:
      return "install.content.errorGeneric";
  }
}
