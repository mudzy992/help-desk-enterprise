import type { INestApplicationContext } from "@nestjs/common";
import { RedisService } from "./common/redis/redis.service";

export const workerLifecycleRedisKey = "worker:lifecycle";
export const workerStartupDeadlineMs = 45_000;
export const workerShutdownDeadlineMs = 30_000;
export type WorkerLifecycleState = "starting" | "ready" | "draining";

export async function publishWorkerLifecycle(
  application: INestApplicationContext,
  state: WorkerLifecycleState,
): Promise<void> {
  const redis = application.get(RedisService).getClient();
  await redis.set(
    workerLifecycleRedisKey,
    JSON.stringify({ state, at: new Date().toISOString() }),
    "EX",
    120,
  );
}

export async function withDeadline<T>(
  operation: Promise<T>,
  milliseconds: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${milliseconds}ms deadline`)),
      milliseconds,
    );
    timer.unref?.();
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
