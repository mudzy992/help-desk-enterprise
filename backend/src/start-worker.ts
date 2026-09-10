import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { createWorkerApplication } from './create-worker-application';
import { shutdownWorker } from './shutdown-worker';

const WORKER_KEEP_ALIVE_INTERVAL_MS = 60_000;
const WORKER_SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = [
  'SIGINT',
  'SIGTERM',
];

export async function startWorker(): Promise<INestApplicationContext> {
  const logger = new Logger('Worker');
  const application = await createWorkerApplication();
  const keepAliveTimer = setInterval(
    () => undefined,
    WORKER_KEEP_ALIVE_INTERVAL_MS,
  );
  let isShuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    await shutdownWorker({ application, keepAliveTimer });
    logger.log('Worker infrastructure stopped');
    process.exit(0);
  };
  for (const signal of WORKER_SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      void shutdown();
    });
  }
  logger.log('Worker infrastructure started');
  return application;
}
