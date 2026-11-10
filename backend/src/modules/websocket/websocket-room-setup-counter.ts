export const websocketRoomSetupFailureKinds = ['user', 'group'] as const;

export type WebsocketRoomSetupFailureKind =
  (typeof websocketRoomSetupFailureKinds)[number];

const failures = new Map<WebsocketRoomSetupFailureKind, number>();

export function recordWebsocketRoomSetupFailure(
  kind: WebsocketRoomSetupFailureKind,
): void {
  failures.set(kind, (failures.get(kind) ?? 0) + 1);
}

export function consumeWebsocketRoomSetupFailures(): Readonly<
  Record<WebsocketRoomSetupFailureKind, number>
> {
  const snapshot = {} as Record<WebsocketRoomSetupFailureKind, number>;
  for (const kind of websocketRoomSetupFailureKinds) {
    snapshot[kind] = failures.get(kind) ?? 0;
    failures.set(kind, 0);
  }
  return snapshot;
}

export function formatWebsocketRoomSetupFailures(
  snapshot: Readonly<Record<WebsocketRoomSetupFailureKind, number>>,
): string {
  return websocketRoomSetupFailureKinds
    .map((kind) => `ws_room_setup_failures_${kind}=${snapshot[kind]}`)
    .join(' ');
}

export type WebsocketRoomSetupFailureLogger = {
  readonly log: (message: string, context?: string) => void;
};

export const websocketRoomSetupFailureLogContext = 'WebsocketMetrics';

/** Logs a process-local room setup failure counter; log pipelines can aggregate instances. */
export function startWebsocketRoomSetupFailureReporter(
  logger: WebsocketRoomSetupFailureLogger,
  intervalMs = 30_000,
): () => void {
  const timer = setInterval(() => {
    logger.log(
      formatWebsocketRoomSetupFailures(consumeWebsocketRoomSetupFailures()),
      websocketRoomSetupFailureLogContext,
    );
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
