export const ticketSocketRevalidationIntervalMs = 60_000;
export const ticketSocketRevalidationBatchSize = 25;

export type TicketSocketRevalidationLogger = {
  readonly warn: (message: string) => void;
};

/** Shared per-process cap for authorization reads started by event and timer paths. */
export class TicketSocketRevalidationLimiter {
  private active = 0;
  private readonly queued: Array<() => void> = [];

  constructor(
    private readonly limit = ticketSocketRevalidationBatchSize,
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('ticket socket revalidation limit must be positive');
    }
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1;
        void Promise.resolve()
          .then(operation)
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1;
            this.queued.shift()?.();
          });
      };
      if (this.active < this.limit) {
        start();
      } else {
        this.queued.push(start);
      }
    });
  }
}

/** Runs no more than `batchSize` ticket authorization checks at once. */
export async function runTicketSocketRevalidationBatch<T>(
  values: readonly T[],
  operation: (value: T) => Promise<void>,
  batchSize = ticketSocketRevalidationBatchSize,
): Promise<void> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('ticket socket revalidation batch size must be positive');
  }
  let nextIndex = 0;
  let hasFailure = false;
  let firstFailure: unknown;
  const workers = Array.from(
    { length: Math.min(values.length, batchSize) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          await operation(values[index] as T);
        } catch (error) {
          if (!hasFailure) {
            hasFailure = true;
            firstFailure = error;
          }
        }
      }
    },
  );
  await Promise.all(workers);
  if (hasFailure) {
    throw firstFailure;
  }
}

/**
 * Starts the ticket-subscription safety sweep. A slow sweep is single-flight:
 * interval ticks do not start another batch on top of it.
 */
export function startTicketSocketRevalidation(
  revalidate: () => Promise<void>,
  logger: TicketSocketRevalidationLogger,
  options: { readonly intervalMs?: number } = {},
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }
    running = true;
    void Promise.resolve()
      .then(revalidate)
      .catch((error: unknown) => {
        logger.warn(
          `ticket_socket_revalidation_sweep_failed reason=${errorText(error)}`,
        );
      })
      .finally(() => {
        running = false;
      });
  }, options.intervalMs ?? ticketSocketRevalidationIntervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
