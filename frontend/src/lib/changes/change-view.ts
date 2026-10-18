import { dateTimeFormatter } from "@/lib/date-time-formatter";
import type { BadgeTone } from "@/lib/ui/presentation-types";
import { ApiError } from "@/services/api";
import type {
  ChangeAction,
  ChangeLevel,
  ChangeOutcome,
  ChangeRisk,
  ChangeStatus,
  ChangeType,
} from "@/services/changes-api";

/** labels, tones, rules mirrored from the backend and error keys. */

export * from "@/lib/changes/change-labels";

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
  return (
    action === "authorize" || action === "schedule" || (action === "submit" && type === "EMERGENCY")
  );
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
  return actions.find(
    (action) => action !== "cancel" && action !== "return" && action !== "withdraw",
  );
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
export function mapChangeError(
  error: unknown,
):
  | ChangeErrorKey
  | "changes.errors.requesterVote"
  | `changes.errors.requirement.${ChangeRequirementField}`
  | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "CHANGE_REQUIREMENT_MISSING") {
    const field = changeRequirementFields.find((candidate) => candidate === error.message);
    if (field !== undefined) return `changes.errors.requirement.${field}`;
  }
  if (error.code === "CHANGE_NOT_APPROVER" && error.message === "requester")
    return "changes.errors.requesterVote";
  return (changeErrorKeys as Readonly<Record<string, ChangeErrorKey>>)[error.code] ?? null;
}

/** Window shown as "start – end"; the end drops the date when on the same day. */
export function formatChangeWindow(
  start: string | null,
  end: string | null,
  language: string,
): string {
  if (start === null || end === null) return "—";
  const locale = language.startsWith("bs") ? "bs-BA" : "en-GB";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "—";
  const full = dateTimeFormatter(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const time = dateTimeFormatter(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const sameDay = startDate.toDateString() === endDate.toDateString();
  return `${full.format(startDate)} – ${sameDay ? time.format(endDate) : full.format(endDate)}`;
}

export { changeHistoryText } from "@/lib/changes/change-history-text";
