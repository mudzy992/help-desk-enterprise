import "dotenv/config";
import { createRedisClient } from "../common/redis/create-redis-client";
import { loadRedisConfiguration } from "../common/redis/load-redis-configuration";
import { workerHeartbeatRedisKey } from "../modules/integration-queue/integration-queue.constants";
import {
  defaultWorkerHeartbeatStaleSeconds,
  evaluateWorkerHeartbeat,
  withTimeout,
} from "../modules/health/health-probes";
import { workerLifecycleRedisKey } from "../worker-lifecycle";

/*
  Paket 2.7 (§3.2): Docker healthcheck of the worker container.
    node dist/src/cli/worker-health.js   → exit 0 healthy, 1 unhealthy
  Reads the worker heartbeat from Redis (written every 10 s by the worker).
*/
async function main(): Promise<number> {
  const redis = createRedisClient(loadRedisConfiguration());
  try {
    const probe = await withTimeout(async () => {
      await redis.connect();
      return Promise.all([
        redis.get(workerHeartbeatRedisKey),
        redis.get(workerLifecycleRedisKey),
      ]);
    }, 4_000);
    const [value, lifecycleRaw] = probe;
    const lifecycle = lifecycleRaw
      ? (JSON.parse(lifecycleRaw) as { state?: string })
      : null;
    const result = evaluateWorkerHeartbeat({
      lastHeartbeatAt: value,
      nowMs: Date.now(),
      staleSeconds: defaultWorkerHeartbeatStaleSeconds,
    });
    const ready = result.status === "ok" && lifecycle?.state === "ready";
    console.log(
      `worker_health=${ready ? "ok" : "fail"} lifecycle=${lifecycle?.state ?? "missing"} heartbeat_age_s=${result.heartbeatAgeSeconds ?? "none"}`,
    );
    return ready ? 0 : 1;
  } catch (error) {
    console.log(`worker_health=fail reason=${(error as Error).message}`);
    return 1;
  } finally {
    redis.disconnect();
  }
}

void main().then((code) => process.exit(code));
