import type { BadgeTone } from "@/components/ui/badge";
import { ApiError } from "@/services/api";
import type { ProblemSeverity, ProblemStatus, ProblemTicketResolveSkip, ProblemTicketSkipReason } from "@/services/problems-api";

/** Paket 3.3: labels, tones and error keys shared by the problem screens. */

export const problemStatusKeys: Readonly<Record<ProblemStatus, `problems.status.${ProblemStatus}`>> = {
  NEW: "problems.status.NEW",
  INVESTIGATING: "problems.status.INVESTIGATING",
  KNOWN_ERROR: "problems.status.KNOWN_ERROR",
  RESOLVED: "problems.status.RESOLVED",
  CLOSED: "problems.status.CLOSED",
  CANCELLED: "problems.status.CANCELLED",
};

export function problemStatusTone(status: ProblemStatus): BadgeTone {
  switch (status) {
    case "NEW":
      return "info";
    case "INVESTIGATING":
      return "primary";
    case "KNOWN_ERROR":
      return "warning";
    case "RESOLVED":
      return "success";
    default:
      return "neutral";
  }
}

export const problemSkipReasonKeys: Readonly<Record<ProblemTicketSkipReason, `problems.link.skip.${ProblemTicketSkipReason}`>> = {
  not_found: "problems.link.skip.not_found",
  merged: "problems.link.skip.merged",
  already_linked: "problems.link.skip.already_linked",
  other_problem: "problems.link.skip.other_problem",
  read_only: "problems.link.skip.read_only",
};

export const problemResolveSkipKeys: Readonly<Record<ProblemTicketResolveSkip, `problems.resolveTickets.skip.${ProblemTicketResolveSkip}`>> = {
  waiting_for_user: "problems.resolveTickets.skip.waiting_for_user",
  pending_approval: "problems.resolveTickets.skip.pending_approval",
  merged: "problems.resolveTickets.skip.merged",
  no_access: "problems.resolveTickets.skip.no_access",
  limit: "problems.resolveTickets.skip.limit",
};

const problemErrorKeys = {
  PROBLEM_MODULE_DISABLED: "problems.errors.disabled",
  PROBLEM_NOT_FOUND: "problems.errors.notFound",
  PROBLEM_FORBIDDEN: "problems.errors.forbidden",
  PROBLEM_OUT_OF_SCOPE: "problems.errors.outOfScope",
  PROBLEM_VALIDATION: "problems.errors.validation",
  PROBLEM_VERSION_CONFLICT: "problems.errors.versionConflict",
  PROBLEM_TICKET_NOT_FOUND: "problems.errors.ticketNotFound",
  PROBLEM_TICKET_IN_OTHER_PROBLEM: "problems.errors.ticketInOtherProblem",
  PROBLEM_TICKET_NOT_LINKED: "problems.errors.ticketNotLinked",
  PROBLEM_NOT_OPEN: "problems.errors.problemNotOpen",
  PROBLEM_UNIT_NOT_FOUND: "problems.errors.unitNotFound",
  PROBLEM_USER_NOT_FOUND: "problems.errors.userNotFound",
  PROBLEM_GROUP_NOT_FOUND: "problems.errors.groupNotFound",
  PROBLEM_SERVICE_NOT_FOUND: "problems.errors.serviceNotFound",
  PROBLEM_ROOT_CAUSE_CATEGORY_INVALID: "problems.errors.rootCauseCategoryInvalid",
  PROBLEM_STATUS_TRANSITION: "problems.errors.statusTransition",
  PROBLEM_REASON_REQUIRED: "problems.errors.reasonRequired",
  PROBLEM_FINAL_STATUS: "problems.errors.finalStatus",
  PROBLEM_REQUIREMENT_MISSING: "problems.errors.requirementMissing",
  PROBLEM_ARTICLE_EXISTS: "problems.errors.articleExists",
  PROBLEM_ARTICLE_INVALID: "problems.errors.articleInvalid",
  PROBLEM_NOT_PROBLEM_GROUP: "problems.errors.notProblemGroup",
  PROBLEM_OWNER_NOT_IN_GROUP: "problems.errors.ownerNotInGroup",
} as const;

export type ProblemErrorKey = (typeof problemErrorKeys)[keyof typeof problemErrorKeys];

const requirementFields = ["owner", "rootCause", "rootCauseCategory", "workaround", "resolution"] as const;
export type ProblemRequirementField = (typeof requirementFields)[number];

export function mapProblemError(error: unknown): ProblemErrorKey | "problems.errors.validationUnit" | `problems.errors.requirement.${ProblemRequirementField}` | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "PROBLEM_REQUIREMENT_MISSING") {
    const field = requirementFields.find((candidate) => candidate === error.message);
    if (field !== undefined) return `problems.errors.requirement.${field}`;
  }
  // A validation error names its field; the most common one gets its own text.
  if (error.code === "PROBLEM_VALIDATION" && error.message === "organizationalUnitId") return "problems.errors.validationUnit";
  return (problemErrorKeys as Readonly<Record<string, ProblemErrorKey>>)[error.code] ?? null;
}

const severityRank: Readonly<Record<ProblemSeverity, number>> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/** §8.1: a problem created from tickets starts at their highest priority. */
export function highestSeverity(values: readonly ProblemSeverity[]): ProblemSeverity {
  return values.reduce<ProblemSeverity>((best, value) => (severityRank[value] > severityRank[best] ? value : best), "MEDIUM");
}

/**
 * §8.1: title suggested from the first selected ticket, description listing
 * the linked ticket numbers (the agent edits both before saving).
 */
export function suggestProblemDraft(
  tickets: readonly { readonly ticketNumber: string; readonly title: string }[],
  descriptionIntro: string,
): { title: string; description: string } {
  const first = tickets[0];
  const title = first === undefined ? "" : first.title.slice(0, 200);
  const numbers = tickets.map((ticket) => ticket.ticketNumber).join(", ");
  return { title, description: numbers.length > 0 ? `${descriptionIntro} ${numbers}` : "" };
}

/** Mirrors the backend (§5): cancel and reopen need a reason. */
export function transitionNeedsReason(from: ProblemStatus, to: ProblemStatus): boolean {
  return to === "CANCELLED" || (to === "INVESTIGATING" && (from === "RESOLVED" || from === "CANCELLED"));
}

export const problemReasonMin = 5;

/** Known category keys have labels; custom keys from the setting show as typed. */
export const knownRootCauseCategories = ["hardware", "software", "network", "configuration", "process", "human", "supplier", "unknown"] as const;

export function rootCauseLabel(t: (key: string) => string, key: string | null): string {
  if (key === null || key === "") return "—";
  return (knownRootCauseCategories as readonly string[]).includes(key) ? t(`problems.rootCause.${key}`) : key;
}

/** Status transition button label: reopen is worded differently. */
export function transitionLabelKey(from: ProblemStatus, to: ProblemStatus): string {
  if (to === "INVESTIGATING" && from === "NEW") return "problems.transition.start";
  if (to === "INVESTIGATING") return "problems.transition.reopen";
  return `problems.transition.${to}`;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

const historyFieldKeys: Readonly<Record<string, string>> = {
  title: "problems.fields.title",
  description: "problems.fields.description",
  impact: "problems.fields.impact",
  urgency: "problems.fields.urgency",
  priority: "problems.fields.priority",
  organizationalUnitId: "problems.fields.organizationalUnit",
  ownerUserId: "problems.fields.owner",
  groupId: "problems.fields.group",
  serviceId: "problems.fields.service",
  rootCauseCategory: "problems.fields.rootCauseCategory",
  rootCause: "problems.fields.rootCause",
  rcaWhys: "problems.fields.whys",
  workaround: "problems.fields.workaround",
  resolution: "problems.fields.resolution",
};

/** One line of the problem history (§16). */
export function problemHistoryText(t: Translate, action: string, detail: Record<string, unknown> | null): string {
  const value = (key: string) => (detail !== null && typeof detail[key] === "string" ? (detail[key] as string) : null);
  switch (action) {
    case "created":
      return t("problems.history.created", { number: value("number") ?? "" });
    case "status": {
      const from = value("from");
      const to = value("to");
      const label = (status: string | null) => (status !== null && status in problemStatusKeys ? t(problemStatusKeys[status as ProblemStatus]) : "—");
      // P5: the sweep closes resolved problems without an actor after N days.
      if (detail !== null && detail.auto === true) {
        return t("problems.history.statusAuto", { from: label(from), to: label(to), days: typeof detail.days === "number" ? detail.days : 0 });
      }
      return t("problems.history.status", { from: label(from), to: label(to) });
    }
    case "ticket_linked":
      // P5: a link on a resolved problem signals a recurrence.
      if (detail !== null && detail.recurrence === true) {
        return t("problems.history.ticketLinkedRecurrence", { ticket: value("ticketNumber") ?? "—" });
      }
      return t("problems.history.ticketLinked", { ticket: value("ticketNumber") ?? "—" });
    case "ticket_unlinked":
      return t("problems.history.ticketUnlinked", { ticket: value("ticketNumber") ?? "—" });
    case "owner":
    case "updated": {
      const changes = detail !== null && typeof detail.changes === "object" && detail.changes !== null ? Object.keys(detail.changes) : [];
      const texts = detail !== null && Array.isArray(detail.textChanged) ? (detail.textChanged as unknown[]).filter((item): item is string => typeof item === "string") : [];
      const fields = [...changes, ...texts].map((field) => (historyFieldKeys[field] ? t(historyFieldKeys[field]) : field));
      return t(action === "owner" ? "problems.history.owner" : "problems.history.updated", { fields: fields.join(", ") || "—" });
    }
    case "knowledge_article":
      return t("problems.history.knowledgeArticle", { title: value("title") ?? "—" });
    case "tickets_resolved": {
      const count = (key: string) => (detail !== null && typeof detail[key] === "number" ? (detail[key] as number) : 0);
      return t("problems.history.ticketsResolved", { resolved: count("resolved"), skipped: count("skipped"), failed: count("failed") });
    }
    default:
      return action;
  }
}
