/** Paket 3.3: problem management constants and domain errors. */

export const problemStatuses = ['NEW', 'INVESTIGATING', 'KNOWN_ERROR', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
export type ProblemStatusValue = (typeof problemStatuses)[number];

export const problemSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ProblemSeverityValue = (typeof problemSeverities)[number];

/** Statuses in which the problem is still being worked on. */
export const problemOpenStatuses: readonly ProblemStatusValue[] = ['NEW', 'INVESTIGATING', 'KNOWN_ERROR'];
export const problemFinalStatuses: readonly ProblemStatusValue[] = ['CLOSED', 'CANCELLED'];

export const problemLimits = {
  titleMax: 200,
  textMax: 8000,
  reasonMin: 5,
  reasonMax: 1000,
  whysMax: 5,
  whyTextMax: 500,
  listMax: 100,
  listDefault: 25,
  searchMax: 120,
  /** Tickets linked in one request (list bulk action, §8.1). */
  linkBatchMax: 50,
} as const;

export const problemEventActions = {
  created: 'created',
  updated: 'updated',
  status: 'status',
  owner: 'owner',
  ticketLinked: 'ticket_linked',
  ticketUnlinked: 'ticket_unlinked',
} as const;

export const problemErrorCodes = {
  disabled: 'PROBLEM_MODULE_DISABLED',
  notFound: 'PROBLEM_NOT_FOUND',
  forbidden: 'PROBLEM_FORBIDDEN',
  outOfScope: 'PROBLEM_OUT_OF_SCOPE',
  unitNotFound: 'PROBLEM_UNIT_NOT_FOUND',
  userNotFound: 'PROBLEM_USER_NOT_FOUND',
  groupNotFound: 'PROBLEM_GROUP_NOT_FOUND',
  serviceNotFound: 'PROBLEM_SERVICE_NOT_FOUND',
  rootCauseCategoryInvalid: 'PROBLEM_ROOT_CAUSE_CATEGORY_INVALID',
  statusTransition: 'PROBLEM_STATUS_TRANSITION',
  requirementMissing: 'PROBLEM_REQUIREMENT_MISSING',
  reasonRequired: 'PROBLEM_REASON_REQUIRED',
  finalStatus: 'PROBLEM_FINAL_STATUS',
  versionConflict: 'PROBLEM_VERSION_CONFLICT',
  validation: 'PROBLEM_VALIDATION',
  ticketNotFound: 'PROBLEM_TICKET_NOT_FOUND',
  ticketInOtherProblem: 'PROBLEM_TICKET_IN_OTHER_PROBLEM',
  ticketNotLinked: 'PROBLEM_TICKET_NOT_LINKED',
  problemNotOpen: 'PROBLEM_NOT_OPEN',
} as const;

export type ProblemErrorCode = (typeof problemErrorCodes)[keyof typeof problemErrorCodes];

export class ProblemError extends Error {
  constructor(
    readonly code: ProblemErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'ProblemError';
  }
}
