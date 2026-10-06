import { ApiError } from "@/services/api";

export type RbacErrorKey =
  | "permissions.errorUnauthorized"
  | "permissions.errorForbidden"
  | "permissions.errorNotFound"
  | "permissions.errorPreviewRequired"
  | "permissions.errorPreviewStale"
  | "permissions.errorGeneric";

const codeKeys: Partial<Record<string, RbacErrorKey>> = {
  INVALID_CREDENTIALS: "permissions.errorUnauthorized",
  FORBIDDEN: "permissions.errorForbidden",
  ROLE_NOT_FOUND: "permissions.errorNotFound",
  INVALID_PERMISSION_KEY: "permissions.errorNotFound",
  // Paket 5.1 (M4 B2): saving without a fresh impact preview is a conflict.
  PREVIEW_REQUIRED: "permissions.errorPreviewRequired",
  PREVIEW_STALE: "permissions.errorPreviewStale",
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
