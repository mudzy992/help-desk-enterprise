/**
 * Faza 3.3 (plan §3.3): one place that owns query keys, so an invalidacija can
 * never miss a cache entry because two call sites spelled the key differently.
 */

/** The local civil day (`YYYY-MM-DD`) of the browser, for day-bounded keys. */
export function localDayKey(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const queryKeys = {
  /** Paket 2.1: own account security (profile page and the expiry banner). */
  accountSecurity: ["account", "security"] as const,
  accountNotifications: ["account", "notifications"] as const,
  /** Paket 2.8: own preferences (keyboard shortcuts; the language is synced separately). */
  userPreferences: ["account", "preferences"] as const,
  routingCatalog: ["catalog", "routing"] as const,
  routingRules: ["catalog", "routing-rules"] as const,
  organizationalUnits: ["catalog", "organizational-units"] as const,
  services: ["catalog", "services"] as const,
  /**
   * The dashboard's id→name lookup caches the raw `ServiceResponse[]`, while
   * `services` caches `{ service }` rows for the catalog table. The two shapes
   * must never share a key: a shared key handed the catalog the raw array and
   * its `row.service.lifecycle` filters crashed the page to a white screen.
   * Kept nested under the same prefix so an invalidation of `services` (or a
   * realtime catalog event) still refreshes the lookup as well.
   */
  dashboardServiceNames: ["catalog", "services", "dashboard-name-lookup"] as const,
  /**
   * The dashboard counters contain a day ("opened today") that the server turns
   * over at the installation's midnight, so the day is part of the key: a tab
   * left open across midnight asks for the new day instead of keeping the
   * previous day's payload.
   */
  dashboardSummary: (dayKey: string) =>
    ["dashboard", "summary", dayKey] as const,
  /**
   * The invalidation handle: React Query matches keys by prefix, so a realtime
   * event drops every day's entry without having to know which day is on screen.
   */
  dashboardSummaryPrefix: ["dashboard", "summary"] as const,
  /** Val 5, M7 B2: the routing preview of the create-ticket review step. */
  ticketRoutingPreview: (serviceId: string, originUnitId: string) =>
    ["tickets", "routing-preview", serviceId, originUnitId] as const,
  ticketLists: ["tickets", "list"] as const,
  ticketList: (query: unknown) => ["tickets", "list", query] as const,
  ticketCounts: (query: unknown) => ["tickets", "counts", query] as const,
  ticket: (ticketId: string) => ["tickets", "detail", ticketId] as const,
  /** Paket 2.4 */
  agentCollaborationConfiguration: ["tickets", "collaboration", "configuration"] as const,
  ticketFollow: (ticketId: string) => ["tickets", "follow", ticketId] as const,
  ticketLinks: (ticketId: string) => ["tickets", "links", ticketId] as const,
  groupInbox: ["tickets", "inbox"] as const,
  offeredServices: ["catalog", "offered-services"] as const,
  createTicketCatalog: ["catalog", "create-ticket"] as const,
  slaSummary: ["sla", "summary"] as const,
  notifications: ["notifications"] as const,
} as const;
