import type { TicketPriority, TicketStatus } from '../../../generated/prisma/enums';

/**
 * Phase 2.4 (plan §2.4): the dashboard and the SLA screen stop deriving their
 * numbers from a page of raw tickets and read them from these aggregates.
 *
 * The shapes are deliberately the ones the client already renders
 * (`DashboardSummary` counters, `SlaExposureCounts`), so the screens change only
 * their data source and not a single label.
 */
export type DashboardSummaryScope =
  | 'all'
  | 'assignedToMe'
  | 'requestedByMe'
  | 'unassigned';

export const dashboardSummaryScopes: readonly DashboardSummaryScope[] = [
  'all',
  'assignedToMe',
  'requestedByMe',
  'unassigned',
];

export type TicketStatusCount = {
  readonly status: TicketStatus;
  readonly count: number;
};

export type TicketPriorityCount = {
  readonly priority: TicketPriority;
  readonly count: number;
};

export type DashboardSummaryCounts = {
  readonly total: number;
  readonly open: number;
  readonly critical: number;
  readonly overdue: number;
  readonly openedToday: number;
  readonly waitingForUser: number;
  readonly pendingApproval: number;
  readonly resolved: number;
  readonly closed: number;
  readonly unrouted: number;
  readonly unassigned: number;
  readonly assignedToMe: number;
  readonly requestedByMe: number;
  readonly statusCounts: readonly TicketStatusCount[];
  readonly priorityCounts: readonly TicketPriorityCount[];
};

export type DashboardSummaryResponse = DashboardSummaryCounts & {
  readonly scope: DashboardSummaryScope;
  readonly generatedAt: string;
};

export type SlaExposureCounts = {
  readonly open: number;
  /** Neither at risk nor breached (plan §2.4: "count po SLA stanju"). */
  readonly onTrack: number;
  readonly atRisk: number;
  readonly breached: number;
};

export type SlaPriorityExposure = {
  readonly priority: TicketPriority;
  readonly exposure: SlaExposureCounts;
};

export type SlaProfileExposure = {
  readonly slaProfileId: string;
  readonly exposure: SlaExposureCounts;
  readonly priorities: readonly SlaPriorityExposure[];
};

export type SlaSummaryResponse = {
  readonly generatedAt: string;
  readonly totals: SlaExposureCounts;
  readonly profiles: readonly SlaProfileExposure[];
};

/** The all-zero answer, used when the actor can see nothing at all. */
export function emptySlaExposureCounts(): SlaExposureCounts {
  return { open: 0, onTrack: 0, atRisk: 0, breached: 0 };
}

export function addSlaExposureCounts(
  left: SlaExposureCounts,
  right: SlaExposureCounts,
): SlaExposureCounts {
  return {
    open: left.open + right.open,
    onTrack: left.onTrack + right.onTrack,
    atRisk: left.atRisk + right.atRisk,
    breached: left.breached + right.breached,
  };
}
