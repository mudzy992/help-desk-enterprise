import type { Server, Socket } from 'socket.io';
import type { SocketPrincipal } from './socket-authentication.types';
import { getSocketPrincipal } from './authenticated-socket';
import { isSocketPrincipal } from './is-socket-principal';

export const socketSessionRevalidationIntervalMs = 15_000;
export const socketSessionRevalidationTimeoutMs = 5_000;
export const socketSessionRevalidationConcurrency = 25;

export type SocketSessionLeaseChecker = {
  readonly isCurrent: (principal: SocketPrincipal) => Promise<boolean>;
};

export type SocketSessionRevalidationLogger = {
  readonly warn: (message: string) => void;
};

export type SocketSessionRevalidationSummary = {
  readonly checked: number;
  readonly disconnected: number;
  readonly expired: number;
  readonly invalid: number;
  readonly failed: number;
};

type LeaseGroup = {
  readonly principal: SocketPrincipal;
  readonly sockets: Socket[];
};

/**
 * Re-checks each unique token lease rather than every tab/socket independently.
 * Any bad result, timeout or store exception is fail-closed for all sockets
 * sharing that token. The durable PostgreSQL authority read plus Redis revocation
 * markers are evaluated by SessionTokenService.isSocketSessionCurrent().
 */
export async function revalidateConnectedSocketSessions(
  sockets: Iterable<Socket>,
  checker: SocketSessionLeaseChecker,
  logger: SocketSessionRevalidationLogger,
  options: {
    readonly nowSeconds?: number;
    readonly timeoutMs?: number;
    readonly concurrency?: number;
  } = {},
): Promise<SocketSessionRevalidationSummary> {
  const summary = { checked: 0, disconnected: 0, expired: 0, invalid: 0, failed: 0 };
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const groups = new Map<string, LeaseGroup>();

  for (const client of sockets) {
    const principal = getSocketPrincipal(client);
    if (!isSocketPrincipal(principal)) {
      if (disconnect(client)) summary.invalid += 1;
      continue;
    }
    if (principal.expiresAt <= nowSeconds) {
      if (disconnect(client)) summary.expired += 1;
      continue;
    }
    const key = socketLeaseKey(principal);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { principal, sockets: [client] });
    } else {
      group.sockets.push(client);
    }
  }

  const entries = [...groups.values()];
  summary.checked = entries.length;
  await mapWithConcurrency(
    entries,
    options.concurrency ?? socketSessionRevalidationConcurrency,
    async (group) => {
      let current = false;
      try {
        current = await withTimeout(
          checker.isCurrent(group.principal),
          options.timeoutMs ?? socketSessionRevalidationTimeoutMs,
        );
      } catch {
        summary.failed += 1;
      }
      if (!current) {
        for (const client of group.sockets) {
          if (disconnect(client)) summary.disconnected += 1;
        }
      }
    },
  );

  if (summary.failed > 0 || summary.invalid > 0) {
    logger.warn(
      `socket_session_revalidation_failed groups=${summary.failed} invalid=${summary.invalid} fail_closed=1`,
    );
  }
  return summary;
}

/** Starts an immediate check and a non-overlapping periodic safety sweep. */
export function startSocketSessionRevalidation(
  server: Server,
  checker: SocketSessionLeaseChecker,
  logger: SocketSessionRevalidationLogger,
  options: { readonly intervalMs?: number } = {},
): () => void {
  let stopped = false;
  let running = false;
  const run = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await revalidateConnectedSocketSessions(
        server.sockets?.sockets?.values() ?? [],
        checker,
        logger,
      );
    } catch {
      // A timer callback must never become an unhandled rejection. Individual
      // lease failures are already handled fail-closed by the sweep above.
      logger.warn('socket_session_revalidation_failed reason=unexpected fail_closed=1');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), options.intervalMs ?? socketSessionRevalidationIntervalMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function socketLeaseKey(principal: SocketPrincipal): string {
  return JSON.stringify([
    principal.subjectId,
    principal.sessionId,
    principal.jti,
    principal.issuedAt,
    principal.expiresAt,
    principal.authzVersion,
  ]);
}

function disconnect(client: Socket): boolean {
  try {
    client.disconnect(true);
    return true;
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  work: (value: T) => Promise<void>,
): Promise<void> {
  if (values.length === 0) return;
  let next = 0;
  const workerCount = Math.max(1, Math.min(values.length, Math.floor(concurrency)));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        const value = values[index];
        if (value !== undefined) await work(value);
      }
    }),
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('socket lease check timeout')), timeoutMs);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
