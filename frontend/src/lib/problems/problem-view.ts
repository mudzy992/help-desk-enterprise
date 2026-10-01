import type { BadgeTone } from "@/components/ui/badge";
import { ApiError } from "@/services/api";
import type { ProblemSeverity, ProblemStatus, ProblemTicketSkipReason } from "@/services/problems-api";

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
} as const;

export type ProblemErrorKey = (typeof problemErrorKeys)[keyof typeof problemErrorKeys];

export function mapProblemError(error: unknown): ProblemErrorKey | null {
  if (!(error instanceof ApiError)) return null;
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
