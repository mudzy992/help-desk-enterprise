import type { ChangeFreezePeriod } from '../settings/definitions/change-settings';
import {
  ChangeError,
  changeErrorCodes,
  changeLimits,
  type ChangeActionValue,
  type ChangeLevelValue,
  type ChangeOutcomeValue,
  type ChangeRiskValue,
  type ChangeStatusValue,
  type ChangeTypeValue,
} from './changes.constants';

const levelScore: Record<ChangeLevelValue, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/** §7: risk = impact x likelihood (1-2 LOW, 3-4 MEDIUM, 6 HIGH, 9 CRITICAL). */
export function computeChangeRisk(impact: ChangeLevelValue, likelihood: ChangeLevelValue): ChangeRiskValue {
  const score = levelScore[impact] * levelScore[likelihood];
  if (score >= 9) return 'CRITICAL';
  if (score >= 6) return 'HIGH';
  if (score >= 3) return 'MEDIUM';
  return 'LOW';
}

export function formatChangeNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(6, '0')}`;
}

/** "CHG-000042" / "000042" / "42" -> 42 when the search looks like a number. */
export function parseChangeNumberSearch(search: string, prefix: string): number | null {
  let value = search.trim();
  if (prefix.length > 0 && value.toUpperCase().startsWith(prefix.toUpperCase())) value = value.slice(prefix.length);
  if (!/^\d{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

/**
 * §6: the status an action leads to for a change of the given type in the
 * given status; null = the action is not available there.
 */
export function changeActionTarget(action: ChangeActionValue, type: ChangeTypeValue, from: ChangeStatusValue): ChangeStatusValue | null {
  switch (action) {
    case 'submit':
      if (from !== 'DRAFT') return null;
      if (type === 'NORMAL') return 'ASSESSMENT';
      if (type === 'EMERGENCY') return 'AUTHORIZATION';
      return null;
    case 'return':
      return from === 'ASSESSMENT' ? 'DRAFT' : null;
    case 'authorize':
      return from === 'ASSESSMENT' && type === 'NORMAL' ? 'AUTHORIZATION' : null;
    case 'withdraw':
      if (from !== 'AUTHORIZATION') return null;
      return type === 'EMERGENCY' ? 'DRAFT' : 'ASSESSMENT';
    case 'schedule':
      return from === 'DRAFT' && type === 'STANDARD' ? 'SCHEDULED' : null;
    case 'start':
      return from === 'SCHEDULED' ? 'IMPLEMENTING' : null;
    case 'finish':
      return from === 'IMPLEMENTING' ? 'REVIEW' : null;
    case 'close':
      return from === 'REVIEW' ? 'CLOSED' : null;
    case 'cancel':
      return from === 'DRAFT' || from === 'ASSESSMENT' || from === 'AUTHORIZATION' || from === 'SCHEDULED' ? 'CANCELLED' : null;
    default:
      return null;
  }
}

const allActions: readonly ChangeActionValue[] = ['submit', 'return', 'authorize', 'withdraw', 'schedule', 'start', 'finish', 'close', 'cancel'];

export function availableChangeActions(type: ChangeTypeValue, status: ChangeStatusValue): ChangeActionValue[] {
  return allActions.filter((action) => changeActionTarget(action, type, status) !== null);
}

/** §6: actions a requester may take on their own change without change.manage. */
export function isRequesterAction(action: ChangeActionValue, status: ChangeStatusValue): boolean {
  return status === 'DRAFT' && (action === 'submit' || action === 'cancel');
}

/** §6: actions whose target is reached through the CAB (moves to AUTHORIZATION). */
export function entersAuthorization(action: ChangeActionValue, type: ChangeTypeValue, from: ChangeStatusValue): boolean {
  return changeActionTarget(action, type, from) === 'AUTHORIZATION';
}

/** Facts of a change the requirement checks look at. */
export type ChangeFacts = {
  readonly type: ChangeTypeValue;
  readonly status: ChangeStatusValue;
  readonly title: string;
  readonly description: string;
  readonly reason: string;
  readonly implementationPlan: string | null;
  readonly backoutPlan: string | null;
  readonly testPlan: string | null;
  readonly plannedStart: Date | null;
  readonly plannedEnd: Date | null;
  readonly cabGroupId: string | null;
  readonly templateId: string | null;
  /** Linked services + assets. */
  readonly linkCount: number;
};

export type ChangeActionInput = {
  readonly reason?: string | null;
  readonly outcome?: ChangeOutcomeValue | null;
  readonly reviewNotes?: string | null;
};

export type ChangeRuleConfiguration = {
  readonly requireTestPlan: boolean;
  readonly minLeadTimeHours: number;
  readonly freezePeriods: readonly ChangeFreezePeriod[];
  readonly timeZone: string;
};

function filled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Calendar day (YYYY-MM-DD) of an instant in the installation time zone. */
export function localDayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** §9: the first freeze period the window touches (days inclusive), or null. */
export function findFreezeOverlap(
  start: Date,
  end: Date,
  periods: readonly ChangeFreezePeriod[],
  timeZone: string,
): ChangeFreezePeriod | null {
  const first = localDayKey(start, timeZone);
  const last = localDayKey(end, timeZone);
  return periods.find((period) => first <= period.to && last >= period.from) ?? null;
}

export function assertChangeWindow(start: Date | null, end: Date | null): void {
  if (start === null || end === null) throw new ChangeError(changeErrorCodes.requirementMissing, 'plannedWindow');
  if (start.getTime() >= end.getTime()) throw new ChangeError(changeErrorCodes.windowInvalid);
}

/** §6: everything a change needs before the CAB (or, for standard changes, before scheduling). */
function assertReadyForWindow(facts: ChangeFacts, configuration: ChangeRuleConfiguration, now: Date, viaCab: boolean): void {
  if (!filled(facts.implementationPlan)) throw new ChangeError(changeErrorCodes.requirementMissing, 'implementationPlan');
  if (!filled(facts.backoutPlan)) throw new ChangeError(changeErrorCodes.requirementMissing, 'backoutPlan');
  if (viaCab && configuration.requireTestPlan && !filled(facts.testPlan)) {
    throw new ChangeError(changeErrorCodes.requirementMissing, 'testPlan');
  }
  assertChangeWindow(facts.plannedStart, facts.plannedEnd);
  const start = facts.plannedStart as Date;
  const end = facts.plannedEnd as Date;
  if (end.getTime() <= now.getTime()) throw new ChangeError(changeErrorCodes.windowInvalid, 'past');
  if (viaCab && facts.cabGroupId === null) throw new ChangeError(changeErrorCodes.requirementMissing, 'cabGroupId');
  if (facts.type === 'NORMAL' && configuration.minLeadTimeHours > 0) {
    const leadMs = configuration.minLeadTimeHours * 3_600_000;
    if (start.getTime() - now.getTime() < leadMs) throw new ChangeError(changeErrorCodes.leadTime, String(configuration.minLeadTimeHours));
  }
  if (facts.type !== 'EMERGENCY') {
    const freeze = findFreezeOverlap(start, end, configuration.freezePeriods, configuration.timeZone);
    if (freeze !== null) throw new ChangeError(changeErrorCodes.freeze, freeze.label || `${freeze.from}..${freeze.to}`);
  }
}

function assertReason(reason: string | null | undefined): void {
  if (typeof reason !== 'string' || reason.trim().length < changeLimits.reasonMin) {
    throw new ChangeError(changeErrorCodes.reasonRequired);
  }
}

/**
 * §6: validates an action against the lifecycle and the requirements of its
 * target status. Returns the target status. Permissions, conflicts and the
 * CAB membership are checked by the service.
 */
export function assertChangeAction(
  facts: ChangeFacts,
  action: ChangeActionValue,
  input: ChangeActionInput,
  configuration: ChangeRuleConfiguration,
  now: Date,
): ChangeStatusValue {
  const target = changeActionTarget(action, facts.type, facts.status);
  if (target === null) throw new ChangeError(changeErrorCodes.transition, `${facts.status}:${action}`);
  switch (action) {
    case 'submit':
      if (facts.title.trim().length < changeLimits.titleMin) throw new ChangeError(changeErrorCodes.requirementMissing, 'title');
      if (!filled(facts.description)) throw new ChangeError(changeErrorCodes.requirementMissing, 'description');
      if (!filled(facts.reason)) throw new ChangeError(changeErrorCodes.requirementMissing, 'reason');
      if (facts.linkCount === 0) throw new ChangeError(changeErrorCodes.requirementMissing, 'links');
      if (target === 'AUTHORIZATION') assertReadyForWindow(facts, configuration, now, true);
      break;
    case 'authorize':
      if (facts.linkCount === 0) throw new ChangeError(changeErrorCodes.requirementMissing, 'links');
      assertReadyForWindow(facts, configuration, now, true);
      break;
    case 'schedule':
      if (facts.templateId === null) throw new ChangeError(changeErrorCodes.requirementMissing, 'templateId');
      if (facts.linkCount === 0) throw new ChangeError(changeErrorCodes.requirementMissing, 'links');
      assertReadyForWindow(facts, configuration, now, false);
      break;
    case 'finish':
      if (input.outcome === undefined || input.outcome === null) throw new ChangeError(changeErrorCodes.requirementMissing, 'outcome');
      break;
    case 'close':
      break;
    case 'return':
    case 'withdraw':
    case 'cancel':
      assertReason(input.reason);
      break;
    default:
      break;
  }
  return target;
}

/** §12: review notes required to close; failed or rolled-back changes need a real lesson. */
export function assertReviewNotes(outcome: ChangeOutcomeValue | null, notes: string | null | undefined): string {
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (text.length === 0) throw new ChangeError(changeErrorCodes.requirementMissing, 'reviewNotes');
  if ((outcome === 'FAILED' || outcome === 'ROLLED_BACK') && text.length < changeLimits.failedReviewMin) {
    throw new ChangeError(changeErrorCodes.requirementMissing, 'reviewNotes');
  }
  if (text.length > changeLimits.textMax) throw new ChangeError(changeErrorCodes.validation, 'reviewNotes');
  return text;
}

/** Timestamps an action sets (§4). */
export function changeActionTimestamps(action: ChangeActionValue, target: ChangeStatusValue, now: Date): Record<string, Date | null> {
  switch (action) {
    case 'submit':
      return target === 'AUTHORIZATION' ? { submittedAt: now, authorizedAt: null } : { submittedAt: now };
    case 'schedule':
      return { submittedAt: now, authorizedAt: now };
    case 'start':
      return { actualStart: now };
    case 'finish':
      return { actualEnd: now };
    case 'close':
      return { closedAt: now };
    case 'cancel':
      return { cancelledAt: now };
    default:
      return {};
  }
}

/**
 * §6: which fields may change in a status. DRAFT: everything; ASSESSMENT:
 * everything but the type (change.manage only); SCHEDULED: window and owner.
 */
export type ChangeEditScope = 'all' | 'window' | 'none';

export function changeEditScope(status: ChangeStatusValue): ChangeEditScope {
  if (status === 'DRAFT' || status === 'ASSESSMENT') return 'all';
  if (status === 'SCHEDULED') return 'window';
  return 'none';
}
