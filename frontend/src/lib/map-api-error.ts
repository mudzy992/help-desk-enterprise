import { ApiError } from "@/services/api";

export type ApiErrorKey =
  | "errors.unauthorized"
  | "errors.forbidden"
  | "errors.notFound"
  | "errors.conflict"
  | "errors.validation"
  | "errors.setupRequired"
  | "errors.readOnly"
  | "errors.server"
  | "errors.network";

const statusKeys: Partial<Record<number, ApiErrorKey>> = {
  400: "errors.validation",
  401: "errors.unauthorized",
  403: "errors.forbidden",
  404: "errors.notFound",
  409: "errors.conflict",
  422: "errors.validation",
  503: "errors.setupRequired",
};

const codeKeys: Partial<Record<string, ApiErrorKey>> = {
  SETUP_REQUIRED: "errors.setupRequired",
  READ_ONLY_MODE: "errors.readOnly",
};

/// Shared mapper for modules without a domain-specific error map.
/// Ticket flows keep using mapTicketError, which carries ticket error codes.
export function mapApiError(error: unknown): ApiErrorKey {
  if (!(error instanceof ApiError)) {
    return "errors.network";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  const byStatus = statusKeys[error.status];
  if (byStatus !== undefined) {
    return byStatus;
  }
  return error.status >= 500 ? "errors.server" : "errors.network";
}

/// The backend attaches a requestId to some failures; surfacing it lets an
/// operator correlate the UI message with the backend log entry.
export function readApiRequestId(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  return error.requestId;
}
