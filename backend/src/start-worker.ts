import { Logger } from "@nestjs/common";
import type { INestApplicationContext } from "@nestjs/common";
import { createWorkerApplication } from "./create-worker-application";
import { shutdownWorker } from "./shutdown-worker";
import {
  publishWorkerLifecycle,
  withDeadline,
  workerStartupDeadlineMs,
} from "./worker-lifecycle";

const WORKER_KEEP_ALIVE_INTERVAL_MS = 30_000;
const WORKER_SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = [
  "SIGINT",
  "SIGTERM",
];

export async function startWorker(): Promise<INestApplicationContext> {
  const logger = new Logger("Worker");
  const application = await withDeadline(
    createWorkerApplication(),
    workerStartupDeadlineMs,
    "worker startup",
  );
  await publishWorkerLifecycle(application, "ready");
  const keepAliveTimer = setInterval(() => {
    void publishWorkerLifecycle(application, "ready").catch(() => undefined);
  }, WORKER_KEEP_ALIVE_INTERVAL_MS);
  let isShuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      logger.error("Second shutdown signal received; forcing worker exit");
      process.exit(1);
      return;
    }
    isShuttingDown = true;
    try {
      await shutdownWorker({ application, keepAliveTimer });
      logger.log("Worker drained and stopped");
      process.exit(0);
    } catch (error) {
      logger.error(
        `Worker forced shutdown type=${error instanceof Error ? error.name : "UnknownError"}`,
      );
      process.exit(1);
    }
  };
  for (const signal of WORKER_SHUTDOWN_SIGNALS)
    process.on(signal, () => {
      void shutdown();
    });
  logger.log("Worker infrastructure ready");
  return application;
}
