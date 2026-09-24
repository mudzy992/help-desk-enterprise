import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import type { TicketUpdatedRealtimePayload } from '../tickets/ticket-realtime.types';

/**
 * Phase 3.2 (plan §3.2): the light event a group room gets instead of every full
 * payload. Under 200 bytes, no ticket content, no message content — just "this
 * ticket in your group moved".
 */
export type GroupFeedChangeKind = 'message' | 'status' | 'assign' | 'sla';

export type GroupFeedChangedPayload = {
  readonly groupId: string;
  readonly ticketId: string;
  readonly kind: GroupFeedChangeKind;
  readonly occurredAt: string;
};

export const groupFeedChangedEventName =
  ticketRealtimeEventNames.groupFeedChanged;

/**
 * Decides whether a ticket event may be announced in a group room, and how.
 *
 * Conservative on purpose (plan §3.2, "ne mijenjaj pravilo vidljivosti"):
 * - a message only when it is `public` — internal notes and system events never
 *   tell a group room that something happened;
 * - a ticket change only when the change itself is not internal-only.
 * The payload carries ids and a kind; never a status, a priority or any content.
 */
export function resolveGroupFeedChange(
  payload: TicketUpdatedRealtimePayload,
): GroupFeedChangedPayload | null {
  if (payload.assignedGroupId === null || payload.assignedGroupId.length === 0) {
    return null;
  }
  if (payload.visibility !== 'public') {
    return null;
  }
  return {
    groupId: payload.assignedGroupId,
    ticketId: payload.ticketId,
    kind: groupFeedChangeKind(payload.change),
    occurredAt: payload.occurredAt,
  };
}

/** Same rule for chat traffic: only public messages reach the group room. */
export function resolveGroupFeedMessage(
  payload: TicketRealtimeMessagePayload,
): GroupFeedChangedPayload | null {
  if (payload.assignedGroupId === null || payload.assignedGroupId.length === 0) {
    return null;
  }
  if (payload.visibility !== 'public') {
    return null;
  }
  return {
    groupId: payload.assignedGroupId,
    ticketId: payload.ticketId,
    kind: 'message',
    occurredAt: payload.createdAt,
  };
}

function groupFeedChangeKind(
  change: TicketUpdatedRealtimePayload['change'],
): GroupFeedChangeKind {
  if (change === 'assignment' || change === 'routing') {
    return 'assign';
  }
  if (change === 'sla') {
    return 'sla';
  }
  return 'status';
}

/**
 * Phase 3.2 transition switch.
 *
 * Rule: "klijent mora raditi i protiv servera prije faze" — and the other way
 * around during a rolling deploy. A client build from before this phase only
 * knows `ticket.updated`, which used to reach group rooms, so the group room
 * keeps receiving it **and** the new light event until every client has been
 * reloaded. Flip this to `off` (env `WS_GROUP_FEED_LEGACY_FULL_EMIT=off`) after
 * the rollout — the runbook in `ops/ws-rolling-deploy.md` describes the order.
 */
export function isLegacyGroupFullEmitEnabled(
  environment: { readonly WS_GROUP_FEED_LEGACY_FULL_EMIT?: string } = process.env,
): boolean {
  const value = environment.WS_GROUP_FEED_LEGACY_FULL_EMIT?.trim().toLowerCase();
  return value !== 'off' && value !== 'false' && value !== '0';
}
