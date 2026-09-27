export const presenceStates = ['viewing', 'typing'] as const;
export type PresenceState = (typeof presenceStates)[number];
export const presenceChannels = ['public', 'internal'] as const;
export type PresenceChannel = (typeof presenceChannels)[number];

/** Paket 2.4 (A1/A2/A5). */
export const presenceTiming = {
  ttlSeconds: 45,
  heartbeatSeconds: 20,
  maxMessagesPerMinute: 30,
} as const;

export type PresenceEntry = {
  readonly userId: string;
  readonly name: string;
  readonly role: 'staff' | 'requester';
  readonly state: PresenceState;
  readonly channel: PresenceChannel;
  /** Epoch milliseconds of the last heartbeat. */
  readonly at: number;
};

/** What the :staff room receives. */
export type StaffPresencePayload = {
  readonly ticketId: string;
  readonly audience: 'staff';
  readonly people: readonly {
    readonly userId: string;
    readonly name: string;
    readonly role: 'staff' | 'requester';
    readonly state: PresenceState;
    readonly channel: PresenceChannel;
  }[];
};

/** What the :public room receives (A3: never names, never internal typing). */
export type RequesterPresencePayload = {
  readonly ticketId: string;
  readonly audience: 'requester';
  readonly agentTyping: boolean;
};

export type PresenceUpdateInput = {
  readonly ticketId: string;
  readonly state: PresenceState | 'leave';
  readonly channel: PresenceChannel;
};

export function parsePresenceUpdate(payload: unknown): PresenceUpdateInput | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const ticketId = typeof record.ticketId === 'string' ? record.ticketId.trim() : '';
  if (ticketId.length === 0 || ticketId.length > 64) {
    return null;
  }
  const state = record.state;
  if (state !== 'viewing' && state !== 'typing' && state !== 'leave') {
    return null;
  }
  const channel = record.channel === 'internal' ? 'internal' : 'public';
  return { ticketId, state, channel };
}
