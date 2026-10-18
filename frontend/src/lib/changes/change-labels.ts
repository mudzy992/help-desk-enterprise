import type { ChangeAction, ChangeLevel, ChangeOutcome, ChangeRisk, ChangeStatus, ChangeType } from "@/services/changes-api";

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

export const changeOutcomeKeys: Readonly<
  Record<ChangeOutcome, `changes.outcome.${ChangeOutcome}`>
> = {
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

