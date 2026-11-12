/** Package 1.7 (R2): configuration domains other admins may be looking at. */
export const adminConfigDomains = ['routing', 'sla', 'catalog', 'groups', 'templates'] as const;
export type AdminConfigDomain = (typeof adminConfigDomains)[number];

export const adminRealtimeEventNames = {
  configUpdated: 'admin.config.updated',
  /** Name from RAW §749. */
  routingRulesUpdated: 'routing.rules.updated',
} as const;

/**
 * BA-websocket-13 room contract: `role:admins` is a GLOBAL admin room. Its
 * payloads (config domain changes, private settings metadata) describe global
 * configuration, so membership requires an unscoped ADMIN/SUPER_ADMIN role
 * assignment (no organizational-unit or service scope). Scoped assignments
 * never join this room; do not add scope-bound payloads here — a future
 * scoped feed needs its own room and contract.
 */
export const adminRealtimeRoomName = 'role:admins';

/** No sensitive data: who, what domain, which HTTP action, when. */
export type AdminConfigUpdatedPayload = {
  readonly domain: AdminConfigDomain;
  readonly action: 'create' | 'update' | 'delete';
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly occurredAt: string;
};
