/** Package 1.7 (R2): configuration domains other admins may be looking at. */
export const adminConfigDomains = ['routing', 'sla', 'catalog', 'groups'] as const;
export type AdminConfigDomain = (typeof adminConfigDomains)[number];

export const adminRealtimeEventNames = {
  configUpdated: 'admin.config.updated',
  /** Name from RAW §749. */
  routingRulesUpdated: 'routing.rules.updated',
} as const;

export const adminRealtimeRoomName = 'role:admins';

/** No sensitive data: who, what domain, which HTTP action, when. */
export type AdminConfigUpdatedPayload = {
  readonly domain: AdminConfigDomain;
  readonly action: 'create' | 'update' | 'delete';
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly occurredAt: string;
};
