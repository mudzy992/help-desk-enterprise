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
  | "tickets.errorReopenDisabled"
  | "tickets.errorReopenRequired"
  | "tickets.errorReopenNotEligible"
  | "tickets.errorConflict"
  | "tickets.errorGeneric";

const codeKeys: Partial<Record<string, TicketErrorKey>> = {
  INVALID_CREDENTIALS: "tickets.errorUnauthorized",
  FORBIDDEN: "tickets.errorForbidden",
  STATUS_CHANGE_FORBIDDEN: "tickets.errorStatusForbidden",
  GROUP_INBOX_DISABLED: "tickets.errorInboxDisabled",
  TICKET_NOT_CLAIMABLE: "tickets.errorNotClaimable",
  INVALID_STATUS_TRANSITION: "tickets.errorInvalidTransition",
  REOPEN_DISABLED: "tickets.errorReopenDisabled",
  REOPEN_REQUIRED: "tickets.errorReopenRequired",
  REOPEN_NOT_ELIGIBLE: "tickets.errorReopenNotEligible",
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
  APPROVALS_DISABLED: "tickets.errorForbidden",
  APPROVAL_SELF_FORBIDDEN: "tickets.errorForbidden",
  APPROVAL_DECISION_REQUIRED: "tickets.errorInvalidTransition",
  APPROVAL_TRANSITION_FORBIDDEN: "tickets.errorInvalidTransition",
  APPROVAL_NOT_PENDING: "tickets.errorConflict",
  APPROVAL_COMMENT_REQUIRED: "tickets.errorValidation",
  INVALID_APPROVAL_COMMENT: "tickets.errorValidation",
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
