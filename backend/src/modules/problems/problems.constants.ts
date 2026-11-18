/** Paket 3.3: problem management constants and domain errors. */

export const problemStatuses = ['NEW', 'INVESTIGATING', 'KNOWN_ERROR', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
export type ProblemStatusValue = (typeof problemStatuses)[number];

export const problemSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ProblemSeverityValue = (typeof problemSeverities)[number];

/** Statuses in which the problem is still being worked on. */
export const problemOpenStatuses: readonly ProblemStatusValue[] = ['NEW', 'INVESTIGATING', 'KNOWN_ERROR'];
/** Ticket statuses that still count as "open" on the problem (§8.3). */
export const problemOpenTicketStatuses = ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] as const;
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
  /** W7.28: handoffs listed per problem (newest first). */
  handoffHistoryMax: 50,
  /** Knowledge article body (KB maximum). */
  articleBodyMax: 20000,
  /**
   * BA-problems-17: every window below is announced, never silent. The list is
   * fetched with one extra row, so `hasMore` is proved and not guessed.
   */
  eventListMax: 200,
  /** Rows the timeline may scan to find one visible event beyond the window. */
  eventScanMax: 5_000,
  linkedTicketListMax: 500,
  linkListMax: 200,
  reverseListMax: 50,
  optionsMax: 2_000,
  messageMax: 8000,
} as const;

export const problemEventActions = {
  created: 'created',
  updated: 'updated',
  status: 'status',
  owner: 'owner',
  ticketLinked: 'ticket_linked',
  ticketUnlinked: 'ticket_unlinked',
  knowledgeArticle: 'knowledge_article',
  ticketsResolved: 'tickets_resolved',
  /** P5b (§9): affected CMDB items, extra services, status-page incidents. */
  /** W7.28: a handed-over problem changes group only through a recorded decision. */
  handoffRequested: 'handoff_requested',
  handoffAccepted: 'handoff_accepted',
  handoffRejected: 'handoff_rejected',
  handoffCancelled: 'handoff_cancelled',
  assetLinked: 'asset_linked',
  assetUnlinked: 'asset_unlinked',
  serviceLinked: 'service_linked',
  serviceUnlinked: 'service_unlinked',
  incidentLinked: 'incident_linked',
  incidentUnlinked: 'incident_unlinked',
} as const;

export const problemErrorCodes = {
  disabled: 'PROBLEM_MODULE_DISABLED',
  notFound: 'PROBLEM_NOT_FOUND',
  forbidden: 'PROBLEM_FORBIDDEN',
  outOfScope: 'PROBLEM_OUT_OF_SCOPE',
  unitNotFound: 'PROBLEM_UNIT_NOT_FOUND',
  userNotFound: 'PROBLEM_USER_NOT_FOUND',
  groupNotFound: 'PROBLEM_GROUP_NOT_FOUND',
  /** Paket 3.3: the group is not marked as a problem group. */
  notProblemGroup: 'PROBLEM_NOT_PROBLEM_GROUP',
  /** Paket 3.3: the owner must be a problem manager of the problem group. */
  ownerNotInGroup: 'PROBLEM_OWNER_NOT_IN_GROUP',
  serviceNotFound: 'PROBLEM_SERVICE_NOT_FOUND',
  /** P5b: the asset does not exist or the CMDB module is off. */
  assetNotFound: 'PROBLEM_ASSET_NOT_FOUND',
  /** P5b: the incident does not exist or the status page is off. */
  incidentNotFound: 'PROBLEM_INCIDENT_NOT_FOUND',
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
  /** W7.26: creation is all-or-nothing; no selected ticket could be linked, so nothing was created. */
  ticketsNotLinked: 'PROBLEM_TICKETS_NOT_LINKED',
  problemNotOpen: 'PROBLEM_NOT_OPEN',
  /** W7.24: the durable group-resolution run is missing, finished differently, or already aborted. */
  resolutionRunNotFound: 'PROBLEM_RESOLUTION_RUN_NOT_FOUND',
  resolutionRunConflict: 'PROBLEM_RESOLUTION_RUN_CONFLICT',
  resolutionRunClosed: 'PROBLEM_RESOLUTION_RUN_CLOSED',
  /** W7.25: unknown reminder id of this problem, a row that is already final, or a live claim. */
  targetReminderNotFound: 'PROBLEM_TARGET_REMINDER_NOT_FOUND',
  targetReminderFinal: 'PROBLEM_TARGET_REMINDER_FINAL',
  targetReminderInProgress: 'PROBLEM_TARGET_REMINDER_IN_PROGRESS',
  articleExists: 'PROBLEM_ARTICLE_EXISTS',
  articleInvalid: 'PROBLEM_ARTICLE_INVALID',
  /** W7.28: the group (or the OU) changes only through a handoff command. */
  handoffRequired: 'PROBLEM_HANDOFF_REQUIRED',
  /** W7.28: this problem already has a transfer waiting for a decision. */
  handoffPending: 'PROBLEM_HANDOFF_PENDING',
  /** W7.28: the handoff does not exist, belongs to another problem, or is not pending any more. */
  handoffNotFound: 'PROBLEM_HANDOFF_NOT_FOUND',
  handoffConflict: 'PROBLEM_HANDOFF_CONFLICT',
  /** W7.28: the target group is the group the problem is already in. */
  handoffSameGroup: 'PROBLEM_HANDOFF_SAME_GROUP',
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
