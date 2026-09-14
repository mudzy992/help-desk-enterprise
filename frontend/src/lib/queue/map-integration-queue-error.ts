import { ApiError } from "@/services/api";

export type IntegrationQueueErrorKey =
  | "integrationQueue.errorUnauthorized"
  | "integrationQueue.errorForbidden"
  | "integrationQueue.errorDisabled"
  | "integrationQueue.errorUnavailable"
  | "integrationQueue.errorInvalidStatus"
  | "integrationQueue.errorNotFound"
  | "integrationQueue.errorGeneric";

export function mapIntegrationQueueError(error: unknown): IntegrationQueueErrorKey {
  if (!(error instanceof ApiError)) {
    return "integrationQueue.errorGeneric";
  }
  if (error.status === 401) {
    return "integrationQueue.errorUnauthorized";
  }
  if (error.code === "ADMIN_UI_DISABLED" || error.status === 403) {
    return error.code === "ADMIN_UI_DISABLED"
      ? "integrationQueue.errorDisabled"
      : "integrationQueue.errorForbidden";
  }
  if (error.code === "UNAVAILABLE" || error.status === 503) {
    return "integrationQueue.errorUnavailable";
  }
  if (error.code === "INVALID_STATUS") {
    return "integrationQueue.errorInvalidStatus";
  }
  if (error.code === "NOT_FOUND" || error.status === 404) {
    return "integrationQueue.errorNotFound";
  }
  return "integrationQueue.errorGeneric";
}
