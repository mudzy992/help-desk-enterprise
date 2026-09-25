import { queryKeys } from "@/lib/query/query-keys";

/**
 * Paket 1.7 (R2/R3): `admin.config.updated { domain }` from the `role:admins`
 * room. Pure helpers plus a tiny in-memory bus between the socket host and the
 * admin screens (which load their data imperatively, not via React Query).
 */
export const adminConfigSocketEvents = {
  configUpdated: "admin.config.updated",
} as const;

export const adminConfigDomains = ["routing", "sla", "catalog", "groups"] as const;
export type AdminConfigDomain = (typeof adminConfigDomains)[number];

export type AdminConfigUpdatedEvent = {
  readonly domain: AdminConfigDomain;
  readonly action: "create" | "update" | "delete";
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly occurredAt: string;
};

export function parseAdminConfigEvent(payload: unknown): AdminConfigUpdatedEvent | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const value = payload as Record<string, unknown>;
  if (!adminConfigDomains.includes(value.domain as AdminConfigDomain)) {
    return null;
  }
  const action =
    value.action === "create" || value.action === "delete" ? value.action : "update";
  return {
    domain: value.domain as AdminConfigDomain,
    action,
    actorUserId: typeof value.actorUserId === "string" ? value.actorUserId : null,
    actorName: typeof value.actorName === "string" ? value.actorName : null,
    occurredAt: typeof value.occurredAt === "string" ? value.occurredAt : new Date().toISOString(),
  };
}

/** React Query caches that depend on a domain (screens outside the admin pages). */
export function queryKeysForAdminConfigDomain(
  domain: AdminConfigDomain,
): readonly (readonly unknown[])[] {
  switch (domain) {
    case "routing":
      return [queryKeys.routingRules, queryKeys.routingCatalog];
    case "catalog":
      return [
        queryKeys.services,
        queryKeys.offeredServices,
        queryKeys.createTicketCatalog,
        queryKeys.routingCatalog,
      ];
    case "sla":
      return [queryKeys.slaSummary];
    case "groups":
      return [queryKeys.routingCatalog];
  }
}

type Listener = (event: AdminConfigUpdatedEvent) => void;
const listeners = new Set<Listener>();

export function publishAdminConfigEvent(event: AdminConfigUpdatedEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeAdminConfigEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * "The admin is editing": focus in a form field inside the screen, or an open
 * dialog/drawer anywhere. Then the screen is not reloaded under their hands.
 */
export function isEditingWithin(container: HTMLElement | null, doc: Document | undefined = globalThis.document): boolean {
  if (doc === undefined) {
    return false;
  }
  if (doc.querySelector('[role="dialog"]') !== null) {
    return true;
  }
  const active = doc.activeElement as HTMLElement | null;
  if (container === null || active === null || !container.contains(active)) {
    return false;
  }
  const tag = active.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable;
}
