import {
  dashboardSummaryCacheKey,
  invalidateReportSummaryCache,
  readReportSummaryCache,
  reportSummaryCacheTtlSeconds,
  slaSummaryCacheKey,
  writeReportSummaryCache,
  type ReportSummaryCacheClient,
} from './report-summary-cache';

function createFakeClient() {
  const store = new Map<string, string>();
  const calls = { set: [] as unknown[][] };
  const client: ReportSummaryCacheClient = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value, mode, ttlSeconds) => {
      calls.set.push([key, value, mode, ttlSeconds]);
      store.set(key, value);
    },
    del: async (key) => {
      store.delete(key);
    },
  };
  return { client, store, calls };
}

const parseNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

describe('report summary cache', () => {
  it('keys by user, authority version and installation zone (M15 B4: no scope segment)', () => {
    expect(dashboardSummaryCacheKey('user-1', 3, 'Europe/Sarajevo')).toBe(
      'reports:dashboard-summary:user-1:v3:Europe/Sarajevo',
    );
    expect(dashboardSummaryCacheKey('user-1', 3, 'UTC')).not.toBe(
      dashboardSummaryCacheKey('user-1', 3, 'Europe/Sarajevo'),
    );
    expect(slaSummaryCacheKey('user-1', 3)).toBe('reports:sla-summary:user-1:v3');
  });

  // W7.100 (BA-reports-10): the payload is a projection of what the user may see, so a security change has to make
  // the old entry unreachable on the next request — not on the next TTL boundary.
  it('moves every key when the authority version changes', () => {
    expect(dashboardSummaryCacheKey('user-1', 4, 'Europe/Sarajevo')).not.toBe(
      dashboardSummaryCacheKey('user-1', 3, 'Europe/Sarajevo'),
    );
    expect(slaSummaryCacheKey('user-1', 4)).not.toBe(slaSummaryCacheKey('user-1', 3));
    expect(slaSummaryCacheKey('user-2', 3)).not.toBe(slaSummaryCacheKey('user-1', 3));
  });

  // W7.105 (BA-reports-15): the entry is `{ v, data }` — versioned, so a payload from another build is a miss.
  it('writes a versioned envelope with the TTL and reads the payload back', async () => {
    const { client, calls, store } = createFakeClient();
    await writeReportSummaryCache(client, 'key', 3);
    expect(calls.set[0]).toEqual([
      'key',
      '{"v":1,"data":3}',
      'EX',
      reportSummaryCacheTtlSeconds,
    ]);
    expect(store.get('key')).toBe('{"v":1,"data":3}');

    await expect(readReportSummaryCache(client, 'key', parseNumber)).resolves.toBe(3);
  });

  it('treats a reused key with another shape as a miss', async () => {
    const { client, store } = createFakeClient();
    store.set('key', '{"v":1,"data":{"total":3}}');
    await expect(
      readReportSummaryCache(client, 'key', (value) =>
        typeof value === 'number' ? value : null,
      ),
    ).resolves.toBeNull();
  });

  it('treats a payload from another schema version and a legacy value as misses', async () => {
    const { client, store } = createFakeClient();
    store.set('future', '{"v":2,"data":3}');
    store.set('legacy', '3');
    await expect(readReportSummaryCache(client, 'future', parseNumber)).resolves.toBeNull();
    await expect(readReportSummaryCache(client, 'legacy', parseNumber)).resolves.toBeNull();
    // A rolling deploy must not evict the other build's entries: they expire on their own.
    expect(store.has('future')).toBe(true);
  });

  it('never throws when Redis is missing or broken', async () => {
    await expect(readReportSummaryCache(null, 'key', parseNumber)).resolves.toBeNull();
    await expect(writeReportSummaryCache(null, 'key', 1)).resolves.toBeUndefined();
    await expect(invalidateReportSummaryCache(null, 'key')).resolves.toBeUndefined();

    const broken: ReportSummaryCacheClient = {
      get: async () => {
        throw new Error('redis is down');
      },
      set: async () => {
        throw new Error('redis is down');
      },
      del: async () => {
        throw new Error('redis is down');
      },
    };
    await expect(readReportSummaryCache(broken, 'key', parseNumber)).resolves.toBeNull();
    await expect(writeReportSummaryCache(broken, 'key', 1)).resolves.toBeUndefined();
    await expect(invalidateReportSummaryCache(broken, 'key')).resolves.toBeUndefined();
  });

  it('ignores a value that is not valid JSON', async () => {
    const { client, store } = createFakeClient();
    store.set('key', 'not json');
    await expect(readReportSummaryCache(client, 'key', parseNumber)).resolves.toBeNull();
  });
});
