/**
 * Paket 2.7 (§8): vocabulary and pure rules of the status page and incidents.
 * No I/O, no clock of its own - everything here is unit-tested.
 */

export const incidentImpacts = ['DEGRADED', 'DOWN', 'MAINTENANCE'] as const;
export type IncidentImpact = (typeof incidentImpacts)[number];

export const incidentStatuses = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];
export const openIncidentStatuses = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] as const satisfies readonly IncidentStatus[];

export const incidentVisibilities = ['ALL_USERS', 'STAFF_ONLY'] as const;
export type IncidentVisibility = (typeof incidentVisibilities)[number];

export type ServiceAvailabilityValue = 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'MAINTENANCE';

export const statusPageLimits = {
  titleMax: 200,
  messageMin: 3,
  messageMax: 4000,
  servicesMax: 50,
  ticketsPerCreateMax: 100,
  openIncidentsListed: 100,
  historyIncidentsListed: 200,
  plannedWindowDays: 14,
  /** Public page: responses cached per process, requests limited per IP. */
  publicCacheMs: 30_000,
  publicRequestsPerMinute: 60,
  /** Notifications on incident start: users with an open ticket on the services. */
  startNotifyMaxRecipients: 2_000,
} as const;

/**
 * "Worst" first: an outage outranks planned maintenance, which outranks
 * degraded service. A service shows the worst of its manual availability,
 * an active downtime window and its open incidents (§8.2).
 */
const availabilityRank: Readonly<Record<ServiceAvailabilityValue, number>> = {
  OPERATIONAL: 0,
  DEGRADED: 1,
  MAINTENANCE: 2,
  DOWN: 3,
};

export function worstAvailability(values: ReadonlyArray<ServiceAvailabilityValue | null | undefined>): ServiceAvailabilityValue {
  let worst: ServiceAvailabilityValue = 'OPERATIONAL';
  for (const value of values) {
    if (value !== null && value !== undefined && availabilityRank[value] > availabilityRank[worst]) worst = value;
  }
  return worst;
}

/**
 * Status moves forward only; RESOLVED is final (a recurrence is a new
 * incident, so history and uptime stay honest). Staying in the same status
 * is allowed - that is a plain timeline update.
 */
export function isIncidentStatusTransitionAllowed(from: IncidentStatus, to: IncidentStatus): boolean {
  if (from === 'RESOLVED') return false;
  return incidentStatuses.indexOf(to) >= incidentStatuses.indexOf(from);
}

export type IncidentSpan = {
  readonly impact: string;
  readonly startedAt: Date;
  readonly resolvedAt: Date | null;
};

/**
 * Share of the window without a DOWN incident, in percent with one decimal
 * (§8.1). Overlapping incidents are merged so an hour is never counted twice.
 * Maintenance and degraded service count as available - they are announced
 * or partial, and the status list shows them separately.
 */
export function uptimePercent(spans: readonly IncidentSpan[], windowStart: Date, windowEnd: Date): number {
  const total = windowEnd.getTime() - windowStart.getTime();
  if (total <= 0) return 100;
  const intervals = spans
    .filter((span) => span.impact === 'DOWN')
    .map((span) => [
      Math.max(span.startedAt.getTime(), windowStart.getTime()),
      Math.min((span.resolvedAt ?? windowEnd).getTime(), windowEnd.getTime()),
    ] as const)
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);
  let down = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;
  for (const [start, end] of intervals) {
    if (currentStart === null || start > currentEnd) {
      if (currentStart !== null) down += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else if (end > currentEnd) {
      currentEnd = end;
    }
  }
  if (currentStart !== null) down += currentEnd - currentStart;
  return Math.floor(((total - down) / total) * 1000) / 10;
}

/** Title in the reader's language; English falls back to the Bosnian title. */
export function localizedIncidentTitle(incident: { readonly title: string; readonly titleEn: string | null }, locale: string): string {
  return locale === 'en' && incident.titleEn !== null && incident.titleEn.trim().length > 0 ? incident.titleEn : incident.title;
}
