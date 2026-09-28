import 'dotenv/config';
import { createRedisClient } from '../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../common/redis/load-redis-configuration';
import { workerHeartbeatRedisKey } from '../modules/integration-queue/integration-queue.constants';
import { defaultWorkerHeartbeatStaleSeconds, evaluateWorkerHeartbeat, withTimeout } from '../modules/health/health-probes';

/*
  Paket 2.7 (§3.2): Docker healthcheck of the worker container.
    node dist/src/cli/worker-health.js   → exit 0 healthy, 1 unhealthy
  Reads the worker heartbeat from Redis (written every 10 s by the worker).
*/
async function main(): Promise<number> {
  const redis = createRedisClient(loadRedisConfiguration());
  try {
    const value = await withTimeout(async () => {
      await redis.connect();
      return redis.get(workerHeartbeatRedisKey);
    }, 4_000);
    const result = evaluateWorkerHeartbeat({
      lastHeartbeatAt: value,
      nowMs: Date.now(),
      staleSeconds: defaultWorkerHeartbeatStaleSeconds,
    });
    console.log(`worker_health=${result.status} heartbeat_age_s=${result.heartbeatAgeSeconds ?? 'none'}`);
    return result.status === 'ok' ? 0 : 1;
  } catch (error) {
    console.log(`worker_health=fail reason=${(error as Error).message}`);
    return 1;
  } finally {
    redis.disconnect();
  }
}

void main().then((code) => process.exit(code));
