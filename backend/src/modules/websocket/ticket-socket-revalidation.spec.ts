import {
  runTicketSocketRevalidationBatch,
  startTicketSocketRevalidation,
  TicketSocketRevalidationLimiter,
} from './ticket-socket-revalidation';

describe('ticket socket revalidation scheduler', () => {
  it('runs each batch with a bounded number of workers', async () => {
    let active = 0;
    let maximumActive = 0;
    const values = Array.from({ length: 31 }, (_, index) => index);

    await runTicketSocketRevalidationBatch(
      values,
      async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
      },
      7,
    );

    expect(maximumActive).toBe(7);
    expect(active).toBe(0);
  });

  it('caps event and sweep authorization reads together', async () => {
    const limiter = new TicketSocketRevalidationLimiter(3);
    let active = 0;
    let maximumActive = 0;

    await Promise.all(
      Array.from({ length: 12 }, () =>
        limiter.run(async () => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await Promise.resolve();
          active -= 1;
        }),
      ),
    );

    expect(maximumActive).toBe(3);
    expect(active).toBe(0);
  });

  it('does not overlap timer sweeps and can stop on demand', async () => {
    jest.useFakeTimers();
    let releaseFirst: (() => void) | undefined;
    const revalidate = jest
      .fn<Promise<void>, []>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const logger = { warn: jest.fn() };
    try {
      const stop = startTicketSocketRevalidation(revalidate, logger, {
        intervalMs: 10,
      });

      await jest.advanceTimersByTimeAsync(10);
      expect(revalidate).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(20);
      expect(revalidate).toHaveBeenCalledTimes(1);

      releaseFirst?.();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(10);
      expect(revalidate).toHaveBeenCalledTimes(2);

      stop();
      await jest.advanceTimersByTimeAsync(30);
      expect(revalidate).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
