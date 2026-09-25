export type TicketForwardingConfiguration = {
  readonly allowCrossOu: boolean;
  readonly requireReason: boolean;
  readonly keepPreviousHandlersAsWatchers: boolean;
  readonly notifyRequester: boolean;
  readonly minReasonLength: number;
};

export type ForwardTicketInput = {
  readonly targetGroupId: string;
  readonly targetUserId?: string;
  readonly reason?: string;
  /** Per-forward opt-in: the forwarding agent stays on the ticket as a watcher. */
  readonly keepMeAsWatcher?: boolean;
};

export type TicketForwardEventRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly fromGroupId: string | null;
  readonly fromGroupName: string | null;
  readonly fromUnitId: string | null;
  readonly toGroupId: string;
  readonly toGroupName: string;
  readonly toUnitId: string;
  readonly toUserId: string | null;
  readonly previousAssigneeId: string | null;
  readonly actorUserId: string | null;
  readonly reason: string;
  readonly isCrossOu: boolean;
  readonly requesterNotified: boolean;
  readonly viaBulk: boolean;
  readonly createdAt: Date;
};

export type ForwardTargetGroup = {
  readonly id: string;
  readonly name: string;
  readonly organizationalUnitId: string;
  readonly organizationalUnitName: string | null;
  readonly organizationalUnitPath: string | null;
  readonly isCrossOu: boolean;
  /** The ticket's current group (only a reassignment to another agent). */
  readonly isCurrent: boolean;
  readonly memberCount: number;
};

export type ForwardTargetAgent = {
  readonly id: string;
  readonly displayName: string;
};

export type ForwardTargetsResponse = {
  readonly currentGroupId: string | null;
  readonly currentUnitId: string;
  readonly previousGroupId: string | null;
  readonly requireReason: boolean;
  readonly minReasonLength: number;
  readonly crossOuAllowed: boolean;
  readonly groups: readonly ForwardTargetGroup[];
};

export type ForwardHistoryItem = {
  readonly id: string;
  readonly fromGroupId: string | null;
  readonly fromGroupName: string | null;
  readonly fromUnitName: string | null;
  readonly toGroupId: string;
  readonly toGroupName: string;
  readonly toUnitName: string | null;
  readonly toUserId: string | null;
  readonly toUserName: string | null;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly reason: string;
  readonly isCrossOu: boolean;
  readonly viaBulk: boolean;
  readonly createdAt: string;
};
