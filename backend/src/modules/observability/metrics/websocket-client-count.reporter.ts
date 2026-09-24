export type WebsocketClientCountLogger = {
  debug?(message: string, context?: string): void;
  log(message: string, context?: string): void;
};

/** The only part of the Socket.IO server this reporter depends on. */
export type WebsocketClientCountSource = {
  readonly engine?: { readonly clientsCount?: number } | undefined;
};

export type WebsocketClientCountReporterOptions = {
  readonly intervalMs: number;
};

export const defaultWebsocketClientCountReporterOptions: WebsocketClientCountReporterOptions =
  { intervalMs: 30_000 };

export const websocketClientCountLogContext = 'WebsocketMetrics';

/**
 * Reads the live connection count, or null when the transport is not ready.
 */
export function readWebsocketClientCount(
  source: WebsocketClientCountSource,
): number | null {
  const count = source.engine?.clientsCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : null;
}

export function formatWebsocketClientCount(count: number): string {
  return `ws_clients_count=${count}`;
}

/**
 * Logs `ws_clients_count` every interval. Returns a stop function; when the
 * server exposes no engine (tests, early boot) it returns a no-op and starts no
 * timer at all.
 */
export function startWebsocketClientCountReporter(
  source: WebsocketClientCountSource,
  logger: WebsocketClientCountLogger,
  options: WebsocketClientCountReporterOptions = defaultWebsocketClientCountReporterOptions,
): () => void {
  if (readWebsocketClientCount(source) === null) {
    return () => undefined;
  }
  const timer = setInterval(() => {
    const count = readWebsocketClientCount(source);
    if (count === null) {
      return;
    }
    const message = formatWebsocketClientCount(count);
    if (logger.debug !== undefined) {
      logger.debug(message, websocketClientCountLogContext);
      return;
    }
    logger.log(message, websocketClientCountLogContext);
  }, options.intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
