import { shutdownWorker } from './shutdown-worker';

describe('shutdownWorker', () => {
  it('clears the keep-alive timer and closes the application context', async () => {
    const keepAliveTimer = setInterval(() => undefined, 60_000);
    const close = jest.fn().mockResolvedValue(undefined);
    await shutdownWorker({
      application: { close } as never,
      keepAliveTimer,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
