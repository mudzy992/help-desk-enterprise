import { ApiError } from "@/services/api";

export type RbacErrorKey =
  | "permissions.errorUnauthorized"
  | "permissions.errorForbidden"
  | "permissions.errorNotFound"
  | "permissions.errorGeneric";

const codeKeys: Partial<Record<string, RbacErrorKey>> = {
  INVALID_CREDENTIALS: "permissions.errorUnauthorized",
  FORBIDDEN: "permissions.errorForbidden",
  ROLE_NOT_FOUND: "permissions.errorNotFound",
  INVALID_PERMISSION_KEY: "permissions.errorNotFound",
};

export function mapRbacError(error: unknown): RbacErrorKey {
  if (!(error instanceof ApiError)) {
    return "permissions.errorGeneric";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (error.status === 401) {
    return "permissions.errorUnauthorized";
  }
  if (error.status === 403) {
    return "permissions.errorForbidden";
  }
  if (error.status === 404) {
    return "permissions.errorNotFound";
  }
  return "permissions.errorGeneric";
}
