import { ApiError } from "@/services/api";

export type GroupsErrorKey =
  | "groups.errorUnauthorized"
  | "groups.errorForbidden"
  | "groups.errorNotFound"
  | "groups.errorValidation"
  | "groups.errorSoleFallback"
  | "groups.errorActiveTickets"
  | "groups.errorMemberExists"
  | "groups.errorMemberMissing"
  | "groups.errorGeneric";

const codeKeys: Partial<Record<string, GroupsErrorKey>> = {
  INVALID_CREDENTIALS: "groups.errorUnauthorized",
  FORBIDDEN: "groups.errorForbidden",
  NOT_FOUND: "groups.errorNotFound",
  USER_NOT_FOUND: "groups.errorNotFound",
  ORGANIZATIONAL_UNIT_NOT_FOUND: "groups.errorNotFound",
  INVALID_NAME: "groups.errorValidation",
  SOLE_FALLBACK_GROUP: "groups.errorSoleFallback",
  HAS_ACTIVE_TICKETS: "groups.errorActiveTickets",
  MEMBER_ALREADY_EXISTS: "groups.errorMemberExists",
  MEMBER_NOT_FOUND: "groups.errorMemberMissing",
};

export function mapGroupsError(error: unknown): GroupsErrorKey {
  if (!(error instanceof ApiError)) {
    return "groups.errorGeneric";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (error.status === 401) {
    return "groups.errorUnauthorized";
  }
  if (error.status === 403) {
    return "groups.errorForbidden";
  }
  if (error.status === 404) {
    return "groups.errorNotFound";
  }
  if (error.status === 409) {
    return "groups.errorSoleFallback";
  }
  if (error.status === 400 || error.status === 422) {
    return "groups.errorValidation";
  }
  return "groups.errorGeneric";
}
