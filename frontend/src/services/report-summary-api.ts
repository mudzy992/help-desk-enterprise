import { apiRequest } from "@/services/api";
import type {
  TicketPriority,
  TicketStatus,
} from "@/services/tickets-api";

/**
 * Phase 2.4 (plan §2.4): the dashboard and SLA counters as served by
 * `GET /reports/dashboard/summary` and `GET /reports/sla/summary`.
 *
 * Both endpoints count with the same RBAC/visibility `where` the ticket lists
 * use, so a number here and the list it links to never disagree; the client only
 * formats them.
 */
export type DashboardSummaryScope =
  | "all"
  | "assignedToMe"
  | "requestedByMe"
  | "unassigned";

export type TicketStatusCount = {
  readonly status: TicketStatus;
  readonly count: number;
};

export type TicketPriorityCount = {
  readonly priority: TicketPriority;
  readonly count: number;
};

export type DashboardSummaryCounts = {
  readonly scope: DashboardSummaryScope;
  readonly generatedAt: string;
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

export type SlaExposureCounts = {
  readonly open: number;
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

/** Counters for the dashboard (phase 2.4). `scope` mirrors the ticket views. */
export function fetchDashboardSummary(
  scope: DashboardSummaryScope = "all",
): Promise<DashboardSummaryCounts> {
  return apiRequest(
    `/reports/dashboard/summary?scope=${encodeURIComponent(scope)}`,
  );
}

/** Exposure per SLA profile and priority (phase 2.4), for the SLA screen. */
export function fetchSlaSummary(): Promise<SlaSummaryResponse> {
  return apiRequest("/reports/sla/summary");
}
