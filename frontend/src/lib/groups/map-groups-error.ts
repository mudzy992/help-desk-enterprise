import { mapDomainApiError } from "@/lib/map-domain-api-error";

export type GroupsErrorKey =
  | "groups.errorUnauthorized"
  | "groups.errorForbidden"
  | "groups.errorNotFound"
  | "groups.errorValidation"
  | "groups.errorDependencies"
  | "groups.errorFallbackConflict"
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
  HAS_DEPENDENCIES: "groups.errorDependencies",
  LAST_FALLBACK_GROUP: "groups.errorSoleFallback",
  FALLBACK_CONFLICT: "groups.errorFallbackConflict",
  MEMBER_ALREADY_EXISTS: "groups.errorMemberExists",
  MEMBER_NOT_FOUND: "groups.errorMemberMissing",
};

export function mapGroupsError(error: unknown): GroupsErrorKey {
  return mapDomainApiError<GroupsErrorKey>(error, {
    fallback: "groups.errorGeneric",
    codes: codeKeys,
    statuses: {
      401: "groups.errorUnauthorized",
      403: "groups.errorForbidden",
      404: "groups.errorNotFound",
      // W2.12: a refused delete now lists its dependencies; the generic 409 text
      // no longer claims the group is the sole fallback.
      409: "groups.errorDependencies",
      400: "groups.errorValidation",
      422: "groups.errorValidation",
    },
  });
}
