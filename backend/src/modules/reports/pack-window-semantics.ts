import { reportPackKeys, type ReportPackKey } from './reports.constants';

/**
 * W7.102 (`BA-reports-12`): the window contract, in one place.
 *
 * Until now every loader answered "is this row in the period?" on its own: the ticket, ping-pong, time-tracking,
 * KB-vote and KPI paths used an inclusive `to`, the problem/change/asset paths used an exclusive one, and four
 * packs ignored the window altogether because they describe the state at the moment of the run. Two adjacent
 * periods therefore did not partition the events: a ticket created exactly at `to` counted in this month and in
 * the next one.
 *
 * The contract is now:
 *
 *  1. the period is **half-open**: `[from, to)` — `from` belongs to the period, `to` does not;
 *  2. a pack is either **event-time** (the period selects rows by an event timestamp), **snapshot-time** (the
 *     period does not select rows at all; the pack shows the present state, measured at the run's `now`) or
 *     **mixed** (it prints both, and each part is listed below);
 *  3. every pack names its timestamps and its snapshot parts here, and keeps its queries inside this entry.
 *
 * `pack-window-semantics.spec.ts` fails when a pack is missing, when an entry contradicts its mode, and when a
 * loader goes back to an inclusive `to` bound.
 */
export const reportWindowBoundaries = '[from, to)' as const;

export type ReportWindowBoundaries = typeof reportWindowBoundaries;

export type ReportPackWindowMode = 'event-time' | 'snapshot-time' | 'mixed';

export type ReportPackWindowSemantics = {
  readonly mode: ReportPackWindowMode;
  /**
   * The timestamps the period filters on, as `entity.field`. Empty only for a pure snapshot pack.
   */
  readonly eventTime: readonly string[];
  /**
   * The parts read as the state at the run's `now` (or at a date horizon derived from it), never as rows inside
   * the period. Empty only for a pure event-time pack.
   */
  readonly snapshotParts: readonly string[];
  /** `change_schedule` is the one pack whose period is an overlap, not an instant. */
  readonly selection: 'instant' | 'overlap' | 'none';
  readonly boundaries: ReportWindowBoundaries;
};

const eventTime = (
  eventTimeFields: readonly string[],
  selection: 'instant' | 'overlap' = 'instant',
): ReportPackWindowSemantics => ({
  mode: 'event-time',
  eventTime: eventTimeFields,
  snapshotParts: [],
  selection,
  boundaries: reportWindowBoundaries,
});

const snapshotTime = (snapshotParts: readonly string[]): ReportPackWindowSemantics => ({
  mode: 'snapshot-time',
  eventTime: [],
  snapshotParts,
  selection: 'none',
  boundaries: reportWindowBoundaries,
});

const mixed = (
  eventTimeFields: readonly string[],
  snapshotParts: readonly string[],
): ReportPackWindowSemantics => ({
  mode: 'mixed',
  eventTime: eventTimeFields,
  snapshotParts,
  selection: 'instant',
  boundaries: reportWindowBoundaries,
});

export const reportPackWindowSemantics: Readonly<Record<ReportPackKey, ReportPackWindowSemantics>> = {
  // Tickets alive in the period (`createdAt < to`, still open or `closedAt >= from`) are grouped by the
  // timestamp of the KPI they feed; `overdueCount` is the present SLA state, not an event in the period.
  [reportPackKeys.monthlyKpi]: mixed(
    ['ticket.createdAt', 'ticket.resolvedAt', 'ticket.closedAt'],
    [
      'overdueCount (SLA state at now)',
      'firstResponseMinutes/slaPausedMs (aggregated over tickets alive in the period)',
    ],
  ),
  // The rows are tickets alive in the period, but the metric is "still overdue now": a snapshot of the SLA
  // state, measured against the same alive-in-period corpus.
  [reportPackKeys.overdueByService]: snapshotTime([
    'isOverdue (SLA state at now) over tickets alive in the period',
  ]),
  [reportPackKeys.topCloseCodes]: eventTime(['ticket.resolvedAt', 'ticket.closedAt']),
  // Votes are events; the articles they attach to are the current KB, not the KB of the period.
  [reportPackKeys.kbHelpfulness]: mixed(['knowledgeFeedback.createdAt'], [
    'articles (knowledgeArticle rows read as they are now, no article timestamp)',
    'views (article view counts at now)',
  ]),
  [reportPackKeys.forwardPingPong]: eventTime(['ticketForwardEvent.createdAt']),
  [reportPackKeys.timeTracking]: eventTime(['timeEntry.startedAt']),
  [reportPackKeys.assetInventory]: snapshotTime(['asset rows and their status at now']),
  [reportPackKeys.assetExpiring]: snapshotTime([
    'warrantyEndsAt and contract endsAt inside the horizon at now',
    'softwareLicense.validUntil at now',
  ]),
  [reportPackKeys.assetLicenseCompliance]: snapshotTime(['seat assignments at now']),
  // The period selects the linked tickets by their creation time; the asset side is read as it is now.
  [reportPackKeys.assetTopTickets]: mixed(['ticket.createdAt (via ticketAsset)'], [
    'asset (tag, name, unit) at now',
  ]),
  [reportPackKeys.assetInactiveHolders]: snapshotTime(['assignedUser.isActive at now']),
  [reportPackKeys.problemTop]: mixed(['problemTicket.linkedAt'], [
    'openTickets (current ticket status of the linked tickets)',
    'ticketsTotal (lifetime links)',
  ]),
  [reportPackKeys.problemTimeToKnownError]: eventTime(['problem.identifiedAt']),
  [reportPackKeys.problemTimeToResolution]: eventTime(['problem.resolvedAt']),
  [reportPackKeys.problemBacklog]: snapshotTime(['open problems at now, with their targetAt']),
  [reportPackKeys.problemRecurrence]: eventTime(['problemEvent.createdAt (action ticket_linked)']),
  [reportPackKeys.changeOutcomes]: eventTime(['change.closedAt']),
  // A change belongs to the period when its planned interval intersects it: `plannedStart < to` and
  // `plannedEnd > from`.
  [reportPackKeys.changeSchedule]: eventTime(
    ['change.plannedStart', 'change.plannedEnd'],
    'overlap',
  ),
};

export function reportPackWindow(pack: ReportPackKey): ReportPackWindowSemantics {
  return reportPackWindowSemantics[pack];
}
