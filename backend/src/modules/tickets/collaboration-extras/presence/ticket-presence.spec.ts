import { buildPresencePayloads } from './build-presence-payloads';
import { allowPresenceMessage } from './presence-rate-limiter';
import { TicketPresenceStore, type PresenceRedisClient } from './ticket-presence.store';
import { parsePresenceUpdate, type PresenceEntry } from './ticket-presence.types';

const entry = (overrides: Partial<PresenceEntry>): PresenceEntry => ({
  userId: 'u1',
  name: 'Amra',
  role: 'staff',
  state: 'viewing',
  channel: 'public',
  at: 1_000_000,
  ...overrides,
});

describe('presence payloads (Paket 2.4 A3)', () => {
  it('never tells the requester about internal typing or names', () => {
    const payloads = buildPresencePayloads(
      't1',
      [entry({ state: 'typing', channel: 'internal' })],
      { showToRequester: true },
    );
    expect(payloads.requester).toEqual({ ticketId: 't1', audience: 'requester', agentTyping: false });
    expect(JSON.stringify(payloads.requester)).not.toContain('Amra');
    expect(payloads.staff.people).toHaveLength(1);
  });

  it('shows public agent typing to the requester only when enabled', () => {
    const typing = [entry({ state: 'typing', channel: 'public' })];
    expect(buildPresencePayloads('t1', typing, { showToRequester: true }).requester.agentTyping).toBe(true);
    expect(buildPresencePayloads('t1', typing, { showToRequester: false }).requester.agentTyping).toBe(false);
  });
});

describe('TicketPresenceStore (Paket 2.4 A2)', () => {
  it('drops entries older than the TTL (memory fallback)', async () => {
    let now = 1_000_000;
    const store = new TicketPresenceStore(null, () => now);
    await store.upsert('t1', entry({ at: now }));
    expect(await store.list('t1')).toHaveLength(1);
    now += 46_000;
    expect(await store.list('t1')).toHaveLength(0);
  });

  it('uses the Redis hash with a 45 s TTL when available', async () => {
    const hash = new Map<string, string>();
    const expire = jest.fn(async () => 1);
    const redis: PresenceRedisClient = {
      status: 'ready',
      hset: async (_key, field, value) => hash.set(field, value),
      hdel: async (_key, ...fields) => fields.forEach((field) => hash.delete(field)),
      hgetall: async () => Object.fromEntries(hash),
      expire,
    };
    const store = new TicketPresenceStore(redis, () => 1_000_000);
    await store.upsert('t1', entry({}));
    expect(expire).toHaveBeenCalledWith('presence:ticket:t1', 45);
    expect(await store.list('t1')).toEqual([entry({})]);
    await store.remove('t1', 'u1');
    expect(await store.list('t1')).toEqual([]);
  });
});

describe('presence input and rate limit (Paket 2.4 A1/A5)', () => {
  it('parses only valid updates', () => {
    expect(parsePresenceUpdate({ ticketId: 't1', state: 'typing', channel: 'internal' })).toEqual({
      ticketId: 't1',
      state: 'typing',
      channel: 'internal',
    });
    expect(parsePresenceUpdate({ ticketId: 't1', state: 'dancing' })).toBeNull();
    expect(parsePresenceUpdate(null)).toBeNull();
  });

  it('allows 30 messages per minute per socket', () => {
    const data = {};
    const results = Array.from({ length: 31 }, () => allowPresenceMessage(data, 5_000));
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(allowPresenceMessage(data, 66_000)).toBe(true);
  });
});
