/**
 * W2.12 (`BA-groups-01`): deleting a group used to be "does it have active
 * tickets?" plus whatever the database did next. The schema around `Group` mixes
 * three very different behaviours:
 *
 *   - `Cascade` - on-call schedule (with its rotation subtree), Teams channel
 *     mapping, response-template scoping, ticket participants and notifications
 *     disappear with the row;
 *   - `SetNull` - closed-ticket assignments, confidential grants, KB ownership,
 *     SLA escalation targets, report schedules and asset routing are silently
 *     detached;
 *   - `Restrict` - routing rules and problem handoffs make the database refuse,
 *     which surfaced as a generic 500.
 *
 * This file names the inventory the delete path now computes **before** it
 * touches anything. A blocker stops the delete with 409 and an actionable list;
 * a detach or a cascade is reported (and audited) but does not silently vanish
 * from the operator's view.
 */
export type GroupDeleteBlockerKind =
  /** The only fallback group of the unit; deleting it leaves the unit uncovered. */
  | 'fallbackGroups'
  /** Tickets still being worked on would lose their handling group. */
  | 'activeTickets'
  /** A rotation (and its overrides/swaps) would be cascade-deleted. */
  | 'onCallSchedule'
  /** The Teams channel binding would be cascade-deleted. */
  | 'teamsChannel'
  /** Response templates scoped to this group would lose their scope rows. */
  | 'responseTemplates'
  /** `Restrict` in the schema: the delete would fail as an opaque database error. */
  | 'routingRules'
  /** `Restrict` in the schema: same as above, on problem handoffs. */
  | 'problemHandoffs'
  /** Access-control configuration: confidential grants would be cascade-deleted. */
  | 'confidentialGrants'
  /** Open problems would lose their owning group (`SetNull`). */
  | 'openProblems'
  /** Open changes would lose their advisory board (`SetNull`). */
  | 'openChanges';

export type GroupDeleteDetachedKind =
  | 'closedTickets'
  | 'ticketParticipants'
  | 'knowledgeArticles'
  | 'slaEscalationRules'
  | 'reportSchedules'
  | 'assetTypes'
  | 'closedProblems'
  | 'closedChanges';

export type GroupDeleteCascadedKind = 'notifications';

export type GroupDeleteBlocker = {
  readonly kind: GroupDeleteBlockerKind;
  readonly count: number;
};

export type GroupDeleteDetached = {
  readonly kind: GroupDeleteDetachedKind;
  readonly count: number;
};

export type GroupDeleteCascaded = {
  readonly kind: GroupDeleteCascadedKind;
  readonly count: number;
};

export type GroupDeleteImpact = {
  /** Non-empty means the delete is refused with 409 and this list. */
  readonly blockers: readonly GroupDeleteBlocker[];
  /** Rows the delete will detach (`SetNull`); reported, not refused. */
  readonly detached: readonly GroupDeleteDetached[];
  /** Rows the delete will remove through `Cascade`; reported, not refused. */
  readonly cascaded: readonly GroupDeleteCascaded[];
};
