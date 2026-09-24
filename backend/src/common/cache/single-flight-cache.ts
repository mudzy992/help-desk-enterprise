/**
 * In-process "single-flight" cache (staging k6, 2026-09-24).
 *
 * Finding: at 20 VUs over 100k tickets the dashboard and the sidebar counters
 * started ~7 COUNT scans each, and every concurrent request of the same user
 * started its own set — 100+ heavy scans at once, the pool (40) ran dry and the
 * API answered 500 after the 3 s connection timeout.
 *
 * Two rules fix that without touching what is counted:
 *  - concurrent callers with the same key share ONE computation (single flight);
 *  - a finished value is reused for `ttlMs` (0 = only the single flight).
 *
 * Failures are never cached, and a waiting caller gets the same rejection as
 * the one that started the work. Entries are bounded (`maxEntries`, oldest
 * first), so a stream of distinct keys cannot grow the heap.
 */
export type SingleFlightCache<T> = {
  get(key: string, compute: () => Promise<T>): Promise<T>;
  /** Drops one key (or everything) — e.g. after a write the caller knows about. */
  invalidate(key?: string): void;
  readonly size: number;
};

export function createSingleFlightCache<T>(options: {
  readonly ttlMs: number | (() => number);
  readonly maxEntries?: number;
  readonly now?: () => number;
}): SingleFlightCache<T> {
  const maxEntries = options.maxEntries ?? 1000;
  const now = options.now ?? Date.now;
  const ttl = (): number =>
    typeof options.ttlMs === 'function' ? options.ttlMs() : options.ttlMs;
  const settled = new Map<string, { readonly value: T; readonly expiresAt: number }>();
  const inFlight = new Map<string, Promise<T>>();

  const remember = (key: string, value: T): void => {
    const ttlMs = ttl();
    if (ttlMs <= 0) {
      return;
    }
    settled.delete(key);
    settled.set(key, { value, expiresAt: now() + ttlMs });
    while (settled.size > maxEntries) {
      const oldest = settled.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      settled.delete(oldest);
    }
  };

  return {
    get(key, compute) {
      const hit = settled.get(key);
      if (hit !== undefined) {
        if (hit.expiresAt > now()) {
          return Promise.resolve(hit.value);
        }
        settled.delete(key);
      }
      const running = inFlight.get(key);
      if (running !== undefined) {
        return running;
      }
      const started = (async () => {
        try {
          const value = await compute();
          remember(key, value);
          return value;
        } finally {
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, started);
      return started;
    },
    invalidate(key) {
      if (key === undefined) {
        settled.clear();
        return;
      }
      settled.delete(key);
    },
    get size() {
      return settled.size;
    },
  };
}

/**
 * One cache per database client: tests build a fresh in-memory client per
 * harness, so a value computed for one harness is never served to another.
 */
export function createPerClientSingleFlightCache<T>(options: {
  readonly ttlMs: number | (() => number);
  readonly maxEntries?: number;
}): (client: object) => SingleFlightCache<T> {
  const caches = new WeakMap<object, SingleFlightCache<T>>();
  return (client) => {
    let cache = caches.get(client);
    if (cache === undefined) {
      cache = createSingleFlightCache<T>(options);
      caches.set(client, cache);
    }
    return cache;
  };
}

/** Reads a non-negative millisecond value from the environment. */
export function readTtlMsFromEnvironment(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallbackMs;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
}
