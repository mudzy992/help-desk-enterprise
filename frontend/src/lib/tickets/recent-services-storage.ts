import { maxRecentServices, pushRecentService } from "@/lib/tickets/service-picker-model";

/**
 * Paket 5.3.1 (D9): recently used services, per user, in this browser only.
 * Holds service ids — nothing personal — under the neutral `service-desk.*`
 * prefix (Paket 4.1). Storage failures (private mode, quota) are ignored: the
 * picker simply has no "recent" group then.
 */
function storageKey(userId: string): string {
  return `service-desk.tickets.recentServices.${userId}`;
}

export function readRecentServices(userId: string | null): readonly string[] {
  if (userId === null) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string").slice(0, maxRecentServices)
      : [];
  } catch {
    return [];
  }
}

export function rememberRecentService(userId: string | null, serviceId: string): readonly string[] {
  if (userId === null) return [];
  const next = pushRecentService(readRecentServices(userId), serviceId);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // ignore — see above
  }
  return next;
}
