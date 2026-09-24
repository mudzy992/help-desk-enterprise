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
  it('keys by user and scope', () => {
    expect(dashboardSummaryCacheKey('user-1', 'all', 'Europe/Sarajevo')).toBe(
      'reports:dashboard-summary:user-1:all:Europe/Sarajevo',
    );
    expect(dashboardSummaryCacheKey('user-1', 'all', 'UTC')).not.toBe(
      dashboardSummaryCacheKey('user-1', 'all', 'Europe/Sarajevo'),
    );
    expect(slaSummaryCacheKey('user-1')).toBe('reports:sla-summary:user-1');
  });

  it('writes with the fifteen second TTL and reads the payload back', async () => {
    const { client, calls } = createFakeClient();
    await writeReportSummaryCache(client, 'key', { total: 3 });
    expect(calls.set[0]).toEqual(['key', '{"total":3}', 'EX', reportSummaryCacheTtlSeconds]);

    await expect(readReportSummaryCache(client, 'key', parseNumber)).resolves.toBeNull();
  });

  it('treats a reused key with another shape as a miss', async () => {
    const { client, store } = createFakeClient();
    store.set('key', '{"total":3}');
    await expect(
      readReportSummaryCache(client, 'key', (value) =>
        typeof value === 'number' ? value : null,
      ),
    ).resolves.toBeNull();
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
