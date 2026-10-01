import type { BadgeTone } from "@/components/ui/badge";
import { ApiError } from "@/services/api";
import type { ChangeAction, ChangeLevel, ChangeOutcome, ChangeRisk, ChangeStatus, ChangeType } from "@/services/changes-api";

/** Paket 3.4: labels, tones, rules mirrored from the backend and error keys. */

export const changeStatusKeys: Readonly<Record<ChangeStatus, `changes.status.${ChangeStatus}`>> = {
  DRAFT: "changes.status.DRAFT",
  ASSESSMENT: "changes.status.ASSESSMENT",
  AUTHORIZATION: "changes.status.AUTHORIZATION",
  SCHEDULED: "changes.status.SCHEDULED",
  IMPLEMENTING: "changes.status.IMPLEMENTING",
  REVIEW: "changes.status.REVIEW",
  CLOSED: "changes.status.CLOSED",
  REJECTED: "changes.status.REJECTED",
  CANCELLED: "changes.status.CANCELLED",
};

export const changeTypeKeys: Readonly<Record<ChangeType, `changes.type.${ChangeType}`>> = {
  STANDARD: "changes.type.STANDARD",
  NORMAL: "changes.type.NORMAL",
  EMERGENCY: "changes.type.EMERGENCY",
};

export const changeRiskKeys: Readonly<Record<ChangeRisk, `changes.risk.${ChangeRisk}`>> = {
  LOW: "changes.risk.LOW",
  MEDIUM: "changes.risk.MEDIUM",
  HIGH: "changes.risk.HIGH",
  CRITICAL: "changes.risk.CRITICAL",
};

export const changeLevelKeys: Readonly<Record<ChangeLevel, `changes.level.${ChangeLevel}`>> = {
  LOW: "changes.level.LOW",
  MEDIUM: "changes.level.MEDIUM",
  HIGH: "changes.level.HIGH",
};

export const changeOutcomeKeys: Readonly<Record<ChangeOutcome, `changes.outcome.${ChangeOutcome}`>> = {
  SUCCESSFUL: "changes.outcome.SUCCESSFUL",
  PARTIAL: "changes.outcome.PARTIAL",
  FAILED: "changes.outcome.FAILED",
  ROLLED_BACK: "changes.outcome.ROLLED_BACK",
};

export const changeActionKeys: Readonly<Record<ChangeAction, `changes.action.${ChangeAction}`>> = {
  submit: "changes.action.submit",
  return: "changes.action.return",
  authorize: "changes.action.authorize",
  withdraw: "changes.action.withdraw",
  schedule: "changes.action.schedule",
  start: "changes.action.start",
  finish: "changes.action.finish",
  close: "changes.action.close",
  cancel: "changes.action.cancel",
};

export function changeStatusTone(status: ChangeStatus): BadgeTone {
  switch (status) {
    case "DRAFT":
      return "neutral";
    case "ASSESSMENT":
      return "info";
    case "AUTHORIZATION":
      return "hold";
    case "SCHEDULED":
      return "primary";
    case "IMPLEMENTING":
      return "warning";
    case "REVIEW":
      return "accent";
    case "CLOSED":
      return "success";
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
}

export function changeRiskTone(risk: ChangeRisk): BadgeTone {
  switch (risk) {
    case "LOW":
      return "success";
    case "MEDIUM":
      return "info";
    case "HIGH":
      return "warning";
    default:
      return "danger";
  }
}

export function changeTypeTone(type: ChangeType): BadgeTone {
  if (type === "EMERGENCY") return "danger";
  if (type === "STANDARD") return "success";
  return "neutral";
}

export function changeOutcomeTone(outcome: ChangeOutcome): BadgeTone {
  if (outcome === "SUCCESSFUL") return "success";
  if (outcome === "PARTIAL") return "warning";
  return "danger";
}

const levelValue: Readonly<Record<ChangeLevel, number>> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/** §7, mirrors `computeChangeRisk`: impact × likelihood. */
export function computeChangeRisk(impact: ChangeLevel, likelihood: ChangeLevel): ChangeRisk {
  const product = levelValue[impact] * levelValue[likelihood];
  if (product <= 2) return "LOW";
  if (product <= 4) return "MEDIUM";
  if (product <= 6) return "HIGH";
  return "CRITICAL";
}

export const changeReasonMin = 5;
export const changeFailedReviewMin = 20;

/** §6: return, withdraw and cancel need a reason. */
export function actionNeedsReason(action: ChangeAction): boolean {
  return action === "return" || action === "withdraw" || action === "cancel";
}

/** §9: actions whose window is checked for conflicts (target AUTHORIZATION or STANDARD schedule). */
export function actionChecksConflicts(action: ChangeAction, type: ChangeType): boolean {
  return action === "authorize" || action === "schedule" || (action === "submit" && type === "EMERGENCY");
}

/** §12: review notes; failed or rolled-back changes need a real lesson. */
export function reviewNotesMin(outcome: ChangeOutcome | null): number {
  return outcome === "FAILED" || outcome === "ROLLED_BACK" ? changeFailedReviewMin : 1;
}

/** Destructive actions use the danger button. */
export function isDestructiveAction(action: ChangeAction): boolean {
  return action === "cancel";
}

/** The natural next step gets the primary button; return, withdraw and cancel sit behind it. */
export function primaryChangeAction(actions: readonly ChangeAction[]): ChangeAction | undefined {
  return actions.find((action) => action !== "cancel" && action !== "return" && action !== "withdraw");
}

const changeErrorKeys = {
  CHANGE_MODULE_DISABLED: "changes.errors.disabled",
  CHANGE_NOT_FOUND: "changes.errors.notFound",
  CHANGE_FORBIDDEN: "changes.errors.forbidden",
  CHANGE_OUT_OF_SCOPE: "changes.errors.outOfScope",
  CHANGE_UNIT_NOT_FOUND: "changes.errors.unitNotFound",
  CHANGE_USER_NOT_FOUND: "changes.errors.userNotFound",
  CHANGE_GROUP_NOT_FOUND: "changes.errors.groupNotFound",
  CHANGE_NOT_CAB_GROUP: "changes.errors.notCabGroup",
  CHANGE_SERVICE_NOT_FOUND: "changes.errors.serviceNotFound",
  CHANGE_ASSET_NOT_FOUND: "changes.errors.assetNotFound",
  CHANGE_PROBLEM_NOT_FOUND: "changes.errors.problemNotFound",
  CHANGE_TEMPLATE_NOT_FOUND: "changes.errors.templateNotFound",
  CHANGE_TEMPLATE_INACTIVE: "changes.errors.templateInactive",
  CHANGE_TEMPLATE_RISK: "changes.errors.templateRisk",
  CHANGE_TRANSITION: "changes.errors.transition",
  CHANGE_REQUIREMENT_MISSING: "changes.errors.requirementMissing",
  CHANGE_REASON_REQUIRED: "changes.errors.reasonRequired",
  CHANGE_FINAL_STATUS: "changes.errors.finalStatus",
  CHANGE_LOCKED: "changes.errors.locked",
  CHANGE_VERSION_CONFLICT: "changes.errors.versionConflict",
  CHANGE_VALIDATION: "changes.errors.validation",
  CHANGE_WINDOW_INVALID: "changes.errors.windowInvalid",
  CHANGE_LEAD_TIME: "changes.errors.leadTime",
  CHANGE_FREEZE: "changes.errors.freeze",
  CHANGE_CONFLICTS_NOT_ACKNOWLEDGED: "changes.errors.conflictsNotAcknowledged",
  CHANGE_NO_APPROVERS: "changes.errors.noApprovers",
  CHANGE_NOT_APPROVER: "changes.errors.notApprover",
  CHANGE_ALREADY_VOTED: "changes.errors.alreadyVoted",
  CHANGE_NOT_IN_AUTHORIZATION: "changes.errors.notInAuthorization",
  CHANGE_OWNER_NOT_MANAGER: "changes.errors.ownerNotManager",
} as const;

export type ChangeErrorKey = (typeof changeErrorKeys)[keyof typeof changeErrorKeys];

export const changeRequirementFields = [
  "title",
  "description",
  "reason",
  "links",
  "templateId",
  "plannedWindow",
  "implementationPlan",
  "backoutPlan",
  "testPlan",
  "cabGroupId",
  "outcome",
  "reviewNotes",
] as const;
export type ChangeRequirementField = (typeof changeRequirementFields)[number];

/** Domain error -> i18n key; null when the error is not a change error. */
export function mapChangeError(error: unknown): ChangeErrorKey | "changes.errors.requesterVote" | `changes.errors.requirement.${ChangeRequirementField}` | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "CHANGE_REQUIREMENT_MISSING") {
    const field = changeRequirementFields.find((candidate) => candidate === error.message);
    if (field !== undefined) return `changes.errors.requirement.${field}`;
  }
  if (error.code === "CHANGE_NOT_APPROVER" && error.message === "requester") return "changes.errors.requesterVote";
  return (changeErrorKeys as Readonly<Record<string, ChangeErrorKey>>)[error.code] ?? null;
}

/** Window shown as "start – end"; the end drops the date when on the same day. */
export function formatChangeWindow(start: string | null, end: string | null, language: string): string {
  if (start === null || end === null) return "—";
  const locale = language.startsWith("bs") ? "bs-BA" : "en-GB";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "—";
  const full = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const sameDay = startDate.toDateString() === endDate.toDateString();
  return `${full.format(startDate)} – ${sameDay ? time.format(endDate) : full.format(endDate)}`;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

const historyFieldKeys: Readonly<Record<string, string>> = {
  title: "changes.fields.title",
  type: "changes.fields.type",
  description: "changes.fields.description",
  reason: "changes.fields.reason",
  impact: "changes.fields.impact",
  likelihood: "changes.fields.likelihood",
  risk: "changes.fields.risk",
  causesDowntime: "changes.fields.causesDowntime",
  plannedStart: "changes.fields.plannedStart",
  plannedEnd: "changes.fields.plannedEnd",
  organizationalUnitId: "changes.fields.organizationalUnit",
  cabGroupId: "changes.fields.cabGroup",
  ownerUserId: "changes.fields.owner",
  problemId: "changes.fields.problem",
  implementationPlan: "changes.fields.implementationPlan",
  backoutPlan: "changes.fields.backoutPlan",
  testPlan: "changes.fields.testPlan",
  communicationPlan: "changes.fields.communicationPlan",
};

const statusLabel = (t: Translate, value: unknown) =>
  typeof value === "string" && value in changeStatusKeys ? t(changeStatusKeys[value as ChangeStatus]) : "—";

const countOf = (detail: Record<string, unknown> | null, key: string): number => {
  const value = detail?.[key];
  if (typeof value === "number") return value;
  return Array.isArray(value) ? value.length : 0;
};

/** One line of the change history (§19). */
export function changeHistoryText(t: Translate, action: string, detail: Record<string, unknown> | null): string {
  const text = (key: string) => (detail !== null && typeof detail[key] === "string" ? (detail[key] as string) : null);
  switch (action) {
    case "created":
      return t("changes.history.created", { number: text("number") ?? "" });
    case "status": {
      const via = text("action");
      if (via === "cab") return t("changes.history.statusCab", { from: statusLabel(t, detail?.from), to: statusLabel(t, detail?.to) });
      if (via === "reschedule") return t("changes.history.statusReschedule");
      return t("changes.history.status", { from: statusLabel(t, detail?.from), to: statusLabel(t, detail?.to) });
    }
    case "owner":
      return detail?.claimed === true ? t("changes.history.claimed") : t("changes.history.owner");
    case "updated": {
      const changes = detail !== null && typeof detail.changes === "object" && detail.changes !== null ? Object.keys(detail.changes) : [];
      const texts = Array.isArray(detail?.textChanged) ? (detail.textChanged as unknown[]).filter((item): item is string => typeof item === "string") : [];
      const fields = [...changes, ...texts].map((field) => (historyFieldKeys[field] ? t(historyFieldKeys[field]) : field));
      const links = countOf(detail, "addedServices") + countOf(detail, "removedServices") + countOf(detail, "addedAssets") + countOf(detail, "removedAssets");
      if (links > 0) fields.push(t("changes.history.linksChanged"));
      return t("changes.history.updated", { fields: fields.join(", ") || "—" });
    }
    case "approval":
      return t(detail?.decision === "REJECTED" ? "changes.history.rejected" : "changes.history.approved", {
        approvals: countOf(detail, "approvals"),
        quorum: countOf(detail, "quorum"),
        round: countOf(detail, "round"),
      });
    case "conflicts_acknowledged":
      return t("changes.history.conflictsAcknowledged");
    case "downtime":
      return t("changes.history.downtime", {
        created: countOf(detail, "created"),
        updated: countOf(detail, "updated"),
        deleted: countOf(detail, "deleted"),
        skipped: countOf(detail, "skippedServiceIds"),
      });
    case "reminder":
      return text("kind") === "overdue" ? t("changes.history.reminderOverdue") : t("changes.history.reminderStartingSoon");
    default:
      return action;
  }
}
