import type {
  SlaExposureCounts,
  SlaSummaryResponse,
} from "@/services/report-summary-api";
import type { TicketPriority } from "@/services/tickets-api";

export const emptySlaExposure: SlaExposureCounts = {
  open: 0,
  onTrack: 0,
  atRisk: 0,
  breached: 0,
};

/**
 * Phase 2.4 (plan §2.4): the SLA screen looks its exposure numbers up in the
 * server aggregate (`GET /reports/sla/summary`) instead of counting a page of
 * tickets in the browser.
 *
 * A profile or priority the aggregate does not know about simply counts zero —
 * the same answer the old client-side counter gave for an empty list.
 */
export type SlaExposureIndex = {
  readonly totals: SlaExposureCounts;
  openCount(profileId: string): number;
  exposure(profileId: string, priority: TicketPriority): SlaExposureCounts;
};

export function buildSlaExposureIndex(
  summary: SlaSummaryResponse | null,
): SlaExposureIndex {
  const byProfile = new Map<
    string,
    { readonly open: number; readonly priorities: Map<TicketPriority, SlaExposureCounts> }
  >();
  for (const profile of summary?.profiles ?? []) {
    byProfile.set(profile.slaProfileId, {
      open: profile.exposure.open,
      priorities: new Map(
        profile.priorities.map((entry) => [entry.priority, entry.exposure]),
      ),
    });
  }
  return {
    totals: summary?.totals ?? emptySlaExposure,
    openCount: (profileId) => byProfile.get(profileId)?.open ?? 0,
    exposure: (profileId, priority) =>
      byProfile.get(profileId)?.priorities.get(priority) ?? emptySlaExposure,
  };
}
