import type {
  PresenceEntry,
  RequesterPresencePayload,
  StaffPresencePayload,
} from './ticket-presence.types';

/**
 * Paket 2.4 (A3): staff see everyone with names and channels; the requester
 * only learns that an agent is typing a PUBLIC reply (no names, and internal
 * typing is never revealed — it is simply not part of this payload).
 */
export function buildPresencePayloads(
  ticketId: string,
  entries: readonly PresenceEntry[],
  options: { readonly showToRequester: boolean },
): { readonly staff: StaffPresencePayload; readonly requester: RequesterPresencePayload } {
  const people = [...entries]
    .sort((a, b) => a.at - b.at)
    .map(({ userId, name, role, state, channel }) => ({ userId, name, role, state, channel }));
  const agentTyping =
    options.showToRequester &&
    entries.some((entry) => entry.role === 'staff' && entry.state === 'typing' && entry.channel === 'public');
  return {
    staff: { ticketId, audience: 'staff', people },
    requester: { ticketId, audience: 'requester', agentTyping },
  };
}
