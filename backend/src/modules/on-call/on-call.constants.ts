export const onCallErrorCodes = {
  disabled: 'ON_CALL_DISABLED',
  groupNotFound: 'ON_CALL_GROUP_NOT_FOUND',
  scheduleNotFound: 'ON_CALL_SCHEDULE_NOT_FOUND',
  invalidSchedule: 'ON_CALL_INVALID_SCHEDULE',
  invalidMember: 'ON_CALL_INVALID_MEMBER',
  invalidRange: 'ON_CALL_INVALID_RANGE',
  overlap: 'ON_CALL_OVERRIDE_OVERLAP',
  overrideNotFound: 'ON_CALL_OVERRIDE_NOT_FOUND',
  swapNotFound: 'ON_CALL_SWAP_NOT_FOUND',
  swapNotAllowed: 'ON_CALL_SWAP_NOT_ALLOWED',
  swapNotPending: 'ON_CALL_SWAP_NOT_PENDING',
  forbidden: 'ON_CALL_FORBIDDEN',
} as const;

export type OnCallErrorCode = (typeof onCallErrorCodes)[keyof typeof onCallErrorCodes];

export const onCallLimits = {
  /** Calendar range per request. */
  maxRangeDays: 93,
  /** An override or swap may not end further ahead than this. */
  maxAheadDays: 366,
  maxOverrideDays: 31,
  maxMembers: 50,
  icalAheadDays: 90,
  icalBehindDays: 7,
} as const;

export class OnCallError extends Error {
  constructor(
    readonly code: OnCallErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'OnCallError';
  }
}
