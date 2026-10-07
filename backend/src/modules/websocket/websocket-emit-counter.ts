/**
 * Phase 3.2 (plan §3.2, item 4): "emit-ova/s po sobi; alert > prag".
 *
 * A per-process counter, one entry per room kind. It is read by the gateway's
 * reporter (one log line per interval) and is deliberately dumb: no timers here,
 * so the broadcast functions stay pure enough to unit test.
 */
export const websocketEmitRoomKinds = [
  'staff',
  'public',
  'user',
  'group',
  'group-legacy',
  'broadcast',
] as const;

export type WebsocketEmitRoomKind = (typeof websocketEmitRoomKinds)[number];

const counts = new Map<WebsocketEmitRoomKind, number>();
type WebsocketEmitListener = (kind: WebsocketEmitRoomKind) => void;
const listeners = new Set<WebsocketEmitListener>();

export function recordWebsocketEmit(kind: WebsocketEmitRoomKind): void {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
  for (const listener of listeners) {
    try {
      listener(kind);
    } catch {
      // Listeners are observability hooks; a failure must never break the
      // broadcast path. The subscribing service logs its own errors.
    }
  }
}

/** Subscribe to every emit observation; returns an unsubscribe function. */
export function addWebsocketEmitListener(listener: WebsocketEmitListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reads and resets the counters — the reporter calls this once per interval. */
export function consumeWebsocketEmitCounts(): Readonly<
  Record<WebsocketEmitRoomKind, number>
> {
  const snapshot = {} as Record<WebsocketEmitRoomKind, number>;
  for (const kind of websocketEmitRoomKinds) {
    snapshot[kind] = counts.get(kind) ?? 0;
    counts.set(kind, 0);
  }
  return snapshot;
}

export function formatWebsocketEmitCounts(
  snapshot: Readonly<Record<WebsocketEmitRoomKind, number>>,
): string {
  return websocketEmitRoomKinds
    .map((kind) => `ws_emits_${kind}=${snapshot[kind]}`)
    .join(' ');
}

export type WebsocketEmitCountLogger = {
  readonly log: (message: string, context?: string) => void;
};

export const websocketEmitCountLogContext = 'WebsocketMetrics';

/** Logs one line per interval; returns a stop function that clears the timer. */
export function startWebsocketEmitCountReporter(
  logger: WebsocketEmitCountLogger,
  intervalMs = 30_000,
): () => void {
  const timer = setInterval(() => {
    logger.log(
      formatWebsocketEmitCounts(consumeWebsocketEmitCounts()),
      websocketEmitCountLogContext,
    );
  }, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
