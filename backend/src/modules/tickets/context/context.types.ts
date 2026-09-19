export type TicketPersonRef = {
  readonly id: string;
  readonly displayName: string;
};

export type TicketGroupRef = {
  readonly id: string;
  readonly name: string;
};

export type TicketPeopleResponse = {
  readonly users: readonly TicketPersonRef[];
  readonly groups: readonly TicketGroupRef[];
};

export type TicketCandidatesResponse = {
  readonly assignees: readonly TicketPersonRef[];
  readonly watchers: readonly TicketPersonRef[];
};

export const ticketHistoryFields = [
  'status',
  'priority',
  'impact',
  'urgency',
  'assignedUser',
  'assignedGroup',
] as const;

export type TicketHistoryField = (typeof ticketHistoryFields)[number];

export type TicketHistoryChange = {
  readonly field: TicketHistoryField;
  /** Enum value for status/priority/impact/urgency, a display name otherwise. */
  readonly from: string | null;
  readonly to: string | null;
};

export type TicketHistoryEntry = {
  readonly id: string;
  readonly createdAt: string;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly changes: readonly TicketHistoryChange[];
};

export type TicketComposerAccess = 'requester' | 'staff' | 'both';

export type TicketAllowedActions = {
  readonly composerAccess: TicketComposerAccess;
  readonly claim: boolean;
  readonly assign: boolean;
  readonly changeStatus: boolean;
  readonly split: boolean;
  readonly requestRemote: boolean;
  readonly addInternalNote: boolean;
  readonly waitForUser: boolean;
  readonly manageParticipants: boolean;
  readonly trackTime: boolean;
  readonly uploadAttachments: boolean;
  readonly viewActivity: boolean;
};

export type TicketSlaUnavailableReason =
  | 'NO_PROFILE'
  | 'PROFILE_INACTIVE'
  | 'NO_RULE'
  | 'NO_CALENDAR'
  | 'NOT_APPLIED';

export type TicketSlaContextResponse = {
  readonly profileName: string | null;
  readonly calendarName: string | null;
  readonly unavailableReason: TicketSlaUnavailableReason | null;
};
