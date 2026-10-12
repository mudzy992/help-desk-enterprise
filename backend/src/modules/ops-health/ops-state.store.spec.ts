import { OpsStateStore } from './ops-state.store';
import { metricsBucketKey } from '../authentication/security/login-security-metrics.service';

/*
  Package 5.4.0-f follow-up (429 alarm): the alarm reads the `login-429` metric
  of 5.4.0-b/e out of Redis. Two properties matter and are pinned here:

    * the keys come from the metrics service's own builder, so the alarm and the
      admin graph can never drift apart;
    * only **complete** minutes are summed — the minute the check runs in is
      still filling, and counting it would make the number jump with the clock.

  The store takes one mget: 60 buckets must not become 60 round-trips.
*/

type FakeRedis = {
  readonly calls: string[][];
  mget(...keys: string[]): Promise<Array<string | null>>;
};

function fakeRedis(values: Readonly<Record<string, string>> = {}): FakeRedis {
  const calls: string[][] = [];
  return {
    calls,
    async mget(...keys: string[]) {
      calls.push(keys);
      return keys.map((key) => values[key] ?? null);
    },
  };
}

function storeWith(client: FakeRedis): OpsStateStore {
  return new OpsStateStore(client as never);
}

describe('OpsStateStore.readLogin429Count', () => {
  const currentMinute = 29_600_000; // an arbitrary whole minute
  const now = new Date(currentMinute * 60_000);

  it('sums the last 60 complete minutes in a single mget', async () => {
    const client = fakeRedis({
      [metricsBucketKey('login-429', currentMinute - 1)]: '5',
      [metricsBucketKey('login-429', currentMinute - 60)]: '7',
      // The current minute is still filling: it must not be counted.
      [metricsBucketKey('login-429', currentMinute)]: '999',
      // Another event in the same minute must not leak in.
      [metricsBucketKey('mfa-failures', currentMinute - 1)]: '400',
    });

    await expect(storeWith(client).readLogin429Count(now, 60)).resolves.toBe(12);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toHaveLength(60);
    expect(client.calls[0]?.[0]).toBe(metricsBucketKey('login-429', currentMinute - 60));
    expect(client.calls[0]?.[59]).toBe(metricsBucketKey('login-429', currentMinute - 1));
  });

  it('treats missing and non-numeric buckets as zero', async () => {
    const client = fakeRedis({
      [metricsBucketKey('login-429', currentMinute - 3)]: '4',
      [metricsBucketKey('login-429', currentMinute - 2)]: 'not-a-number',
    });

    await expect(storeWith(client).readLogin429Count(now, 60)).resolves.toBe(4);
  });

  it('returns zero without touching Redis when the window is empty', async () => {
    const client = fakeRedis();
    await expect(storeWith(client).readLogin429Count(now, 0)).resolves.toBe(0);
    expect(client.calls).toEqual([]);
  });
});
