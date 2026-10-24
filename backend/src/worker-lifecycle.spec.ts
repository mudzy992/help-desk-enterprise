import { publishWorkerLifecycle, withDeadline } from "./worker-lifecycle";

describe("worker lifecycle contract", () => {
  it("publishes an expiring readiness state", async () => {
    const set = jest.fn().mockResolvedValue("OK");
    await publishWorkerLifecycle(
      { get: () => ({ getClient: () => ({ set }) }) } as never,
      "ready",
    );
    expect(set).toHaveBeenCalledWith(
      "worker:lifecycle",
      expect.stringContaining('"state":"ready"'),
      "EX",
      120,
    );
  });

  it("enforces the startup deadline", async () => {
    jest.useFakeTimers();
    const assertion = expect(
      withDeadline(new Promise(() => undefined), 20, "worker startup"),
    ).rejects.toThrow("worker startup exceeded 20ms deadline");
    await jest.advanceTimersByTimeAsync(21);
    await assertion;
    jest.useRealTimers();
  });

  it("allows work that completes inside the deadline", async () => {
    await expect(withDeadline(Promise.resolve("ok"), 20, "test")).resolves.toBe(
      "ok",
    );
  });
});
