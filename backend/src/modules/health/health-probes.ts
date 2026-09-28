/*
  Paket 2.7 (§3): readiness and worker probes. Pure logic, so it is testable
  without Nest; the controller only wires Prisma/Redis in.

  Public responses carry `ok | fail` per component and nothing else — no
  versions, hosts or error messages (those are in the admin "System health" tab).
*/
export type ProbeState = 'ok' | 'fail';

export type ReadinessResult = {
  readonly status: ProbeState;
  readonly checks: { readonly database: ProbeState; readonly redis: ProbeState };
};

export type WorkerProbeResult = {
  readonly status: ProbeState;
  /** Seconds since the last worker heartbeat; null when none is known. */
  readonly heartbeatAgeSeconds: number | null;
};

export const readinessTimeouts = { databaseMs: 2_000, redisMs: 1_000 } as const;
export const readinessCacheMs = 5_000;
/** Paket 2.7 §10 `ops.thresholds.workerHeartbeatStaleSeconds` default. */
export const defaultWorkerHeartbeatStaleSeconds = 120;

export async function withTimeout<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function probe(work: () => Promise<unknown>, timeoutMs: number): Promise<ProbeState> {
  try {
    await withTimeout(work, timeoutMs);
    return 'ok';
  } catch {
    return 'fail';
  }
}

export async function probeReadiness(dependencies: {
  readonly pingDatabase: () => Promise<unknown>;
  readonly pingRedis: () => Promise<unknown>;
}): Promise<ReadinessResult> {
  const [database, redis] = await Promise.all([
    probe(dependencies.pingDatabase, readinessTimeouts.databaseMs),
    probe(dependencies.pingRedis, readinessTimeouts.redisMs),
  ]);
  return { status: database === 'ok' && redis === 'ok' ? 'ok' : 'fail', checks: { database, redis } };
}

export function evaluateWorkerHeartbeat(input: {
  readonly lastHeartbeatAt: string | null;
  readonly nowMs: number;
  readonly staleSeconds: number;
}): WorkerProbeResult {
  const at = input.lastHeartbeatAt === null ? Number.NaN : Date.parse(input.lastHeartbeatAt);
  if (Number.isNaN(at)) return { status: 'fail', heartbeatAgeSeconds: null };
  const age = Math.max(0, Math.round((input.nowMs - at) / 1000));
  return { status: age <= input.staleSeconds ? 'ok' : 'fail', heartbeatAgeSeconds: age };
}

/** Caches one in-flight/settled result for `ttlMs`, so a burst of monitors costs one probe. */
export class CachedProbe<T> {
  private value: { readonly at: number; readonly result: Promise<T> } | null = null;

  constructor(
    private readonly run: () => Promise<T>,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(): Promise<T> {
    const current = this.value;
    if (current !== null && this.now() - current.at < this.ttlMs) return current.result;
    const result = this.run();
    this.value = { at: this.now(), result };
    return result;
  }
}
