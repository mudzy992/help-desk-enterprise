import { ApiError } from "@/services/api";

export type TicketErrorKey =
  | "tickets.errorUnauthorized"
  | "tickets.errorForbidden"
  | "tickets.errorNotFound"
  | "tickets.errorValidation"
  | "tickets.errorInboxDisabled"
  | "tickets.errorNotClaimable"
  | "tickets.errorStatusForbidden"
  | "tickets.errorInvalidTransition"
  | "tickets.errorConflict"
  | "tickets.errorGeneric";

const codeKeys: Partial<Record<string, TicketErrorKey>> = {
  INVALID_CREDENTIALS: "tickets.errorUnauthorized",
  FORBIDDEN: "tickets.errorForbidden",
  STATUS_CHANGE_FORBIDDEN: "tickets.errorStatusForbidden",
  GROUP_INBOX_DISABLED: "tickets.errorInboxDisabled",
  TICKET_NOT_CLAIMABLE: "tickets.errorNotClaimable",
  INVALID_STATUS_TRANSITION: "tickets.errorInvalidTransition",
  NOT_FOUND: "tickets.errorNotFound",
  OVERLAPPING_TIMER: "tickets.errorConflict",
  INVALID_TITLE: "tickets.errorValidation",
  INVALID_DESCRIPTION: "tickets.errorValidation",
  SERVICE_REQUIRED: "tickets.errorValidation",
  SERVICE_NOT_OFFERED: "tickets.errorValidation",
  FORM_VERSION_REQUIRED: "tickets.errorValidation",
  FORM_VERSION_NOT_ACTIVE: "tickets.errorValidation",
  INVALID_MESSAGE_BODY: "tickets.errorValidation",
  INVALID_MESSAGE_TYPE: "tickets.errorValidation",
  MESSAGE_TYPE_NOT_ALLOWED: "tickets.errorForbidden",
  PARTICIPANTS_DISABLED: "tickets.errorForbidden",
  ATTACHMENTS_DISABLED: "tickets.errorForbidden",
  ATTACHMENT_TOO_LARGE: "tickets.errorValidation",
  ATTACHMENT_TYPE_NOT_ALLOWED: "tickets.errorValidation",
  ATTACHMENT_LIMIT_REACHED: "tickets.errorValidation",
  ORIGIN_UNIT_REQUIRED: "tickets.errorValidation",
};

export function mapTicketError(error: unknown): TicketErrorKey {
  if (!(error instanceof ApiError)) {
    return "tickets.errorGeneric";
  }
  if (error.status === 401) {
    return "tickets.errorUnauthorized";
  }
  if (error.status === 404) {
    return "tickets.errorNotFound";
  }
  const mapped = codeKeys[error.code];
  if (mapped !== undefined) {
    return mapped;
  }
  if (error.status === 403) {
    return "tickets.errorForbidden";
  }
  if (error.status === 400) {
    return "tickets.errorValidation";
  }
  return "tickets.errorGeneric";
}
