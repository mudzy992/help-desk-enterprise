import { shutdownWorker } from "./shutdown-worker";

function application(close: jest.Mock) {
  return {
    close,
    get: () => ({
      getClient: () => ({ set: jest.fn().mockResolvedValue("OK") }),
    }),
  } as never;
}

describe("shutdownWorker", () => {
  it("publishes draining, closes Bull/Nest, and flushes telemetry", async () => {
    const keepAliveTimer = setInterval(() => undefined, 60_000);
    const close = jest.fn().mockResolvedValue(undefined);
    const flushTelemetry = jest.fn().mockResolvedValue(undefined);
    await shutdownWorker({
      application: application(close),
      keepAliveTimer,
      flushTelemetry,
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(flushTelemetry).toHaveBeenCalledTimes(1);
  });

  it("fails closed when an active job does not drain before the deadline", async () => {
    jest.useFakeTimers();
    const keepAliveTimer = setInterval(() => undefined, 60_000);
    const close = jest.fn(() => new Promise(() => undefined));
    const assertion = expect(
      shutdownWorker({
        application: application(close),
        keepAliveTimer,
        deadlineMs: 50,
      }),
    ).rejects.toThrow("worker drain exceeded 50ms deadline");
    await jest.advanceTimersByTimeAsync(51);
    await assertion;
    jest.useRealTimers();
  });
});
