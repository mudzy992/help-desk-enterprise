export type WorkerHeartbeatStatus = 'active' | 'stale' | 'unknown';

export function resolveWorkerHeartbeatStatus(input: {
  readonly lastHeartbeatAt: string | null;
  readonly nowMilliseconds: number;
  readonly staleThresholdMilliseconds: number;
}): WorkerHeartbeatStatus {
  if (input.lastHeartbeatAt === null || input.lastHeartbeatAt.length === 0) {
    return 'unknown';
  }
  const heartbeatMilliseconds = Date.parse(input.lastHeartbeatAt);
  if (Number.isNaN(heartbeatMilliseconds)) {
    return 'unknown';
  }
  const ageMilliseconds = input.nowMilliseconds - heartbeatMilliseconds;
  // A future timestamp beyond the tolerance may be clock skew or bad data,
  // not evidence of a live worker.
  if (ageMilliseconds < -input.staleThresholdMilliseconds) return 'unknown';
  if (ageMilliseconds > input.staleThresholdMilliseconds) {
    return 'stale';
  }
  return 'active';
}
