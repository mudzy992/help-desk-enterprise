import { ApiError } from "@/services/api";

export type UsersErrorKey =
  | "users.errorUnauthorized"
  | "users.errorForbidden"
  | "users.errorNotFound"
  | "users.errorSuperAdminGrant"
  | "users.errorSuperAdminManage"
  | "users.errorGeneric";

const codeKeys: Partial<Record<string, UsersErrorKey>> = {
  INVALID_CREDENTIALS: "users.errorUnauthorized",
  FORBIDDEN: "users.errorForbidden",
  USER_NOT_FOUND: "users.errorNotFound",
  ROLE_NOT_FOUND: "users.errorNotFound",
  USER_ROLE_NOT_FOUND: "users.errorNotFound",
  ORGANIZATIONAL_UNIT_NOT_FOUND: "users.errorNotFound",
  SERVICE_NOT_FOUND: "users.errorNotFound",
  SUPER_ADMIN_GRANT_FORBIDDEN: "users.errorSuperAdminGrant",
  SUPER_ADMIN_MANAGE_FORBIDDEN: "users.errorSuperAdminManage",
};

export function mapUsersError(error: unknown): UsersErrorKey {
  if (!(error instanceof ApiError)) {
    return "users.errorGeneric";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (error.status === 401) {
    return "users.errorUnauthorized";
  }
  if (error.status === 403) {
    return "users.errorForbidden";
  }
  if (error.status === 404) {
    return "users.errorNotFound";
  }
  return "users.errorGeneric";
}
