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
  if (ageMilliseconds > input.staleThresholdMilliseconds) {
    return 'stale';
  }
  return 'active';
}
