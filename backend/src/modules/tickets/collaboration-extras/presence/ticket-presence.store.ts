import type { PresenceEntry } from './ticket-presence.types';
import { presenceTiming } from './ticket-presence.types';

/** The subset of ioredis the presence store uses. */
export type PresenceRedisClient = {
  readonly status?: string;
  connect?(): Promise<unknown>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hdel(key: string, ...fields: string[]): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  expire(key: string, seconds: number): Promise<unknown>;
};

export function presenceKey(ticketId: string): string {
  return `presence:ticket:${ticketId}`;
}

/**
 * Paket 2.4 (A2): `presence:ticket:<id>` hash, field per user, TTL 45 s on the
 * key and a per-entry timestamp (hash fields do not expire on their own, so
 * stale entries are dropped on read). Works across API replicas. Without a
 * usable Redis (tests, outage) it falls back to process memory — presence is
 * transient, so a degraded single-instance view is acceptable.
 */
export class TicketPresenceStore {
  private readonly memory = new Map<string, Map<string, PresenceEntry>>();

  constructor(
    private readonly redis: PresenceRedisClient | null,
    private readonly now: () => number = Date.now,
  ) {}

  async upsert(ticketId: string, entry: PresenceEntry): Promise<void> {
    const client = await this.client();
    if (client !== null) {
      try {
        const key = presenceKey(ticketId);
        await client.hset(key, entry.userId, JSON.stringify(entry));
        await client.expire(key, presenceTiming.ttlSeconds);
        return;
      } catch {
        // fall through to memory
      }
    }
    const map = this.memory.get(ticketId) ?? new Map<string, PresenceEntry>();
    map.set(entry.userId, entry);
    this.memory.set(ticketId, map);
  }

  async remove(ticketId: string, userId: string): Promise<void> {
    const client = await this.client();
    if (client !== null) {
      try {
        await client.hdel(presenceKey(ticketId), userId);
      } catch {
        // ignore
      }
    }
    this.memory.get(ticketId)?.delete(userId);
  }

  async list(ticketId: string): Promise<readonly PresenceEntry[]> {
    const cutoff = this.now() - presenceTiming.ttlSeconds * 1000;
    const client = await this.client();
    if (client !== null) {
      try {
        const raw = await client.hgetall(presenceKey(ticketId));
        const live: PresenceEntry[] = [];
        const stale: string[] = [];
        for (const [field, value] of Object.entries(raw ?? {})) {
          const entry = parseEntry(value);
          if (entry === null || entry.at < cutoff) stale.push(field);
          else live.push(entry);
        }
        if (stale.length > 0) {
          await client.hdel(presenceKey(ticketId), ...stale).catch(() => undefined);
        }
        return live;
      } catch {
        // fall through to memory
      }
    }
    const map = this.memory.get(ticketId);
    if (map === undefined) return [];
    for (const [userId, entry] of map) {
      if (entry.at < cutoff) map.delete(userId);
    }
    return [...map.values()];
  }

  private async client(): Promise<PresenceRedisClient | null> {
    const client = this.redis;
    if (client === null || typeof client.hset !== 'function' || typeof client.hgetall !== 'function') {
      return null;
    }
    try {
      if (client.status === 'wait' && client.connect !== undefined) {
        await client.connect();
      }
      return client;
    } catch {
      return null;
    }
  }
}

function parseEntry(value: string): PresenceEntry | null {
  try {
    const parsed = JSON.parse(value) as Partial<PresenceEntry>;
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.at !== 'number' ||
      (parsed.state !== 'viewing' && parsed.state !== 'typing') ||
      (parsed.channel !== 'public' && parsed.channel !== 'internal') ||
      (parsed.role !== 'staff' && parsed.role !== 'requester')
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      role: parsed.role,
      state: parsed.state,
      channel: parsed.channel,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}
