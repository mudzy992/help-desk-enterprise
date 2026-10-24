import type { INestApplicationContext } from "@nestjs/common";
import {
  publishWorkerLifecycle,
  withDeadline,
  workerShutdownDeadlineMs,
} from "./worker-lifecycle";
import { flushWorkerTelemetry } from "./flush-worker-telemetry";

export async function shutdownWorker(options: {
  readonly application: INestApplicationContext;
  readonly keepAliveTimer: ReturnType<typeof setInterval>;
  readonly deadlineMs?: number;
  readonly flushTelemetry?: () => Promise<void>;
}): Promise<void> {
  clearInterval(options.keepAliveTimer);
  try {
    await publishWorkerLifecycle(options.application, "draining");
  } catch {
    /* shutdown must continue */
  }
  await withDeadline(
    (async () => {
      // Nest closes BullMQ workers first; BullMQ Worker.close() stops intake and waits
      // for active jobs, leaving unfinished jobs lock-recoverable if the deadline wins.
    await options.application.close();
    await (options.flushTelemetry ?? flushWorkerTelemetry)();
    })(),
    options.deadlineMs ?? workerShutdownDeadlineMs,
    "worker drain",
  );
}
