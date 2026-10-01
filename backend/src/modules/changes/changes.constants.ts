/** Paket 3.4: change management constants and domain errors. */

export const changeTypes = ['STANDARD', 'NORMAL', 'EMERGENCY'] as const;
export type ChangeTypeValue = (typeof changeTypes)[number];

export const changeStatuses = [
  'DRAFT',
  'ASSESSMENT',
  'AUTHORIZATION',
  'SCHEDULED',
  'IMPLEMENTING',
  'REVIEW',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
] as const;
export type ChangeStatusValue = (typeof changeStatuses)[number];

export const changeLevels = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type ChangeLevelValue = (typeof changeLevels)[number];

export const changeRisks = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ChangeRiskValue = (typeof changeRisks)[number];

export const changeOutcomes = ['SUCCESSFUL', 'PARTIAL', 'FAILED', 'ROLLED_BACK'] as const;
export type ChangeOutcomeValue = (typeof changeOutcomes)[number];

/** Lifecycle actions (§6); CAB votes are separate (§8). */
export const changeActions = ['submit', 'return', 'authorize', 'withdraw', 'schedule', 'start', 'finish', 'close', 'cancel'] as const;
export type ChangeActionValue = (typeof changeActions)[number];

export const changeFinalStatuses: readonly ChangeStatusValue[] = ['CLOSED', 'REJECTED', 'CANCELLED'];
/** Statuses whose window blocks the calendar and counts in conflicts (§9). */
export const changeActiveWindowStatuses: readonly ChangeStatusValue[] = ['AUTHORIZATION', 'SCHEDULED', 'IMPLEMENTING'];

export const changeLimits = {
  titleMin: 3,
  titleMax: 200,
  textMax: 8000,
  reasonTextMax: 4000,
  reasonMin: 5,
  reasonMax: 1000,
  commentMax: 2000,
  /** §12: failed or rolled-back changes need a real lesson. */
  failedReviewMin: 20,
  listMax: 100,
  listDefault: 25,
  searchMax: 120,
  linksMax: 50,
  /** §17 calendar: one query per period. */
  calendarMaxDays: 62,
  calendarMaxItems: 500,
  templateNameMax: 200,
  templateDescriptionMax: 4000,
} as const;

export const changeEventActions = {
  created: 'created',
  updated: 'updated',
  status: 'status',
  owner: 'owner',
  approval: 'approval',
  serviceLinked: 'service_linked',
  serviceUnlinked: 'service_unlinked',
  assetLinked: 'asset_linked',
  assetUnlinked: 'asset_unlinked',
  problem: 'problem',
  downtime: 'downtime',
  conflictsAcknowledged: 'conflicts_acknowledged',
  reminder: 'reminder',
} as const;

export const changeErrorCodes = {
  disabled: 'CHANGE_MODULE_DISABLED',
  notFound: 'CHANGE_NOT_FOUND',
  forbidden: 'CHANGE_FORBIDDEN',
  outOfScope: 'CHANGE_OUT_OF_SCOPE',
  unitNotFound: 'CHANGE_UNIT_NOT_FOUND',
  userNotFound: 'CHANGE_USER_NOT_FOUND',
  groupNotFound: 'CHANGE_GROUP_NOT_FOUND',
  notCabGroup: 'CHANGE_NOT_CAB_GROUP',
  serviceNotFound: 'CHANGE_SERVICE_NOT_FOUND',
  assetNotFound: 'CHANGE_ASSET_NOT_FOUND',
  problemNotFound: 'CHANGE_PROBLEM_NOT_FOUND',
  templateNotFound: 'CHANGE_TEMPLATE_NOT_FOUND',
  templateInactive: 'CHANGE_TEMPLATE_INACTIVE',
  /** §13: standard templates must be low or medium risk. */
  templateRisk: 'CHANGE_TEMPLATE_RISK',
  transition: 'CHANGE_TRANSITION',
  requirementMissing: 'CHANGE_REQUIREMENT_MISSING',
  reasonRequired: 'CHANGE_REASON_REQUIRED',
  finalStatus: 'CHANGE_FINAL_STATUS',
  locked: 'CHANGE_LOCKED',
  versionConflict: 'CHANGE_VERSION_CONFLICT',
  validation: 'CHANGE_VALIDATION',
  windowInvalid: 'CHANGE_WINDOW_INVALID',
  leadTime: 'CHANGE_LEAD_TIME',
  freeze: 'CHANGE_FREEZE',
  conflictsNotAcknowledged: 'CHANGE_CONFLICTS_NOT_ACKNOWLEDGED',
  noApprovers: 'CHANGE_NO_APPROVERS',
  notApprover: 'CHANGE_NOT_APPROVER',
  alreadyVoted: 'CHANGE_ALREADY_VOTED',
  notInAuthorization: 'CHANGE_NOT_IN_AUTHORIZATION',
  ownerNotManager: 'CHANGE_OWNER_NOT_MANAGER',
} as const;

export type ChangeErrorCode = (typeof changeErrorCodes)[keyof typeof changeErrorCodes];

export class ChangeError extends Error {
  constructor(
    readonly code: ChangeErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'ChangeError';
  }
}
