import { ApiError } from "@/services/api";

export const templatesErrorCodes = [
  "TEMPLATES_DISABLED",
  "PLAYBOOKS_DISABLED",
  "FORBIDDEN",
  "TEMPLATE_NOT_FOUND",
  "PLAYBOOK_NOT_FOUND",
  "TEMPLATE_NAME_INVALID",
  "TEMPLATE_NAME_TAKEN",
  "TEMPLATE_BODY_INVALID",
  "TEMPLATE_UNKNOWN_VARIABLE",
  "TEMPLATE_KIND_MISMATCH",
  "TEMPLATE_SCOPE_INVALID",
  "TEMPLATE_SCOPE_FORBIDDEN",
  "TEMPLATE_TAGS_INVALID",
  "REASON_REQUIRED",
  "PLAYBOOK_NAME_INVALID",
  "PLAYBOOK_NAME_TAKEN",
  "PLAYBOOK_STEPS_INVALID",
  "PLAYBOOK_REFERENCE_INVALID",
  "TICKET_PLAYBOOK_NOT_FOUND",
  "TICKET_PLAYBOOK_ALREADY_ATTACHED",
  "TICKET_PLAYBOOK_NOT_APPLICABLE",
  "TICKET_PLAYBOOK_UP_TO_DATE",
  "TICKET_PLAYBOOK_STEP_NOT_FOUND",
  "TICKET_PLAYBOOK_READ_ONLY",
] as const;
export type TemplatesErrorCode = (typeof templatesErrorCodes)[number];
export type TemplatesErrorKey = `templates.errors.${TemplatesErrorCode | "generic" | "network"}`;

const codes = new Set<string>(templatesErrorCodes);

/** Paket 1.4: backend `TemplatesError` codes → i18n keys. */
export function mapTemplatesError(error: unknown): TemplatesErrorKey {
  if (!(error instanceof ApiError)) return "templates.errors.network";
  if (codes.has(error.code)) return `templates.errors.${error.code as TemplatesErrorCode}`;
  if (error.status === 403) return "templates.errors.FORBIDDEN";
  if (error.status === 404) return "templates.errors.TEMPLATE_NOT_FOUND";
  return "templates.errors.generic";
}
