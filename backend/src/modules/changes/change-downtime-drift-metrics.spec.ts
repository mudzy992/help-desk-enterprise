import {
  changeDowntimeDriftMetricKey,
  changeDowntimeDriftMetricTtlSeconds,
  ChangeDowntimeDriftMetricStore,
} from "./change-downtime-drift-metrics";

function setup(initial: string | null = null) {
  const store = new Map<string, string>();
  if (initial !== null) store.set(changeDowntimeDriftMetricKey, initial);
  const set = jest.fn(async (key: string, value: string, _mode: string, _ttl: number) => {
    store.set(key, value);
    return "OK";
  });
  const get = jest.fn(async (key: string) => store.get(key) ?? null);
  // ioredis overloads `set`; the store only needs the four-argument form.
  return { redis: { set, get } as never, set, get };
}

describe("ChangeDowntimeDriftMetricStore (W7.69, BA-changes-13)", () => {
  it("stores counts and one instant, with a bounded lifetime", async () => {
    const { redis, set } = setup();
    const metrics = new ChangeDowntimeDriftMetricStore(redis, () => 1_000);

    await metrics.record({ scanned: 40, drifted: 3 });

    expect(set).toHaveBeenCalledWith(
      changeDowntimeDriftMetricKey,
      JSON.stringify({ completedAtMs: 1_000, scanned: 40, drifted: 3 }),
      "EX",
      changeDowntimeDriftMetricTtlSeconds,
    );
    await expect(metrics.read()).resolves.toEqual({
      completedAtMs: 1_000,
      scanned: 40,
      drifted: 3,
    });
  });

  it("treats a missing, malformed or partial record as unknown", async () => {
    await expect(
      new ChangeDowntimeDriftMetricStore(setup().redis).read(),
    ).resolves.toBeNull();
    await expect(
      new ChangeDowntimeDriftMetricStore(setup("not json").redis).read(),
    ).resolves.toBeNull();
    await expect(
      new ChangeDowntimeDriftMetricStore(setup('{"completedAtMs":5}').redis).read(),
    ).resolves.toBeNull();
  });

  it("keeps no identifier: the record is counts and one timestamp", async () => {
    const { redis, set } = setup();
    const metrics = new ChangeDowntimeDriftMetricStore(redis, () => 42);
    await metrics.record({ scanned: 1, drifted: 1 });
    const payload = set.mock.calls[0]![1] as string;
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual([
      "completedAtMs",
      "drifted",
      "scanned",
    ]);
  });
});
