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
  routingCatalog: ["catalog", "routing"] as const,
  routingRules: ["catalog", "routing-rules"] as const,
  organizationalUnits: ["catalog", "organizational-units"] as const,
  services: ["catalog", "services"] as const,
  /**
   * The dashboard counters contain a day ("opened today") that the server turns
   * over at the installation's midnight, so the day is part of the key: a tab
   * left open across midnight asks for the new day instead of keeping the
   * previous day's payload.
   */
  dashboardSummary: (scope: string, dayKey: string) =>
    ["dashboard", "summary", scope, dayKey] as const,
  /**
   * The invalidation handle: React Query matches keys by prefix, so a realtime
   * event drops every day's entry without having to know which day is on screen.
   */
  dashboardSummaryPrefix: (scope: string) => ["dashboard", "summary", scope] as const,
  ticketLists: ["tickets", "list"] as const,
  ticketList: (query: unknown) => ["tickets", "list", query] as const,
  ticketCounts: (query: unknown) => ["tickets", "counts", query] as const,
  ticket: (ticketId: string) => ["tickets", "detail", ticketId] as const,
  groupInbox: ["tickets", "inbox"] as const,
  offeredServices: ["catalog", "offered-services"] as const,
  createTicketCatalog: ["catalog", "create-ticket"] as const,
  slaSummary: ["sla", "summary"] as const,
  notifications: ["notifications"] as const,
} as const;
