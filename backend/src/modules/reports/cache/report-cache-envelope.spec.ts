import {
  byteLength,
  invalidateReportCacheEntry,
  readReportCacheEntry,
  readReportCacheValue,
  reportCacheMaxBytes,
  reportCacheSchemaVersion,
  writeReportCacheEntry,
  type ReportCacheClient,
} from './report-cache-envelope';

/*
  W7.105 (BA-reports-15): every report cache entry is `{ v, data }`, capped in bytes and validated strictly. A miss is
  never an error — the database is the source of truth — but a miss has a reason, and the reason decides whether the
  entry is deleted (it can never be valid) or left to expire (another build wrote it).
*/
function createFakeClient() {
  const store = new Map<string, string>();
  const calls = { set: [] as unknown[][], del: [] as string[] };
  const client: ReportCacheClient = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value, mode, ttlSeconds) => {
      calls.set.push([key, value, mode, ttlSeconds]);
      store.set(key, value);
    },
    del: async (key) => {
      calls.del.push(key);
      store.delete(key);
    },
  };
  return { client, store, calls };
}

const parseNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const envelope = (data: unknown, version: number = reportCacheSchemaVersion): string =>
  JSON.stringify({ v: version, data });

describe('report cache envelope', () => {
  it('round-trips through the versioned envelope', async () => {
    const { client, store, calls } = createFakeClient();

    const write = await writeReportCacheEntry(client, 'key', { total: 3 }, 60);

    expect(write).toEqual({ written: true, bytes: byteLength('{"v":1,"data":{"total":3}}') });
    expect(calls.set[0]).toEqual([
      'key',
      '{"v":1,"data":{"total":3}}',
      'EX',
      60,
    ]);
    expect(store.get('key')).toBe('{"v":1,"data":{"total":3}}');
    await expect(readReportCacheEntry(client, 'key', parseNumber)).resolves.toMatchObject({
      hit: false,
      reason: 'invalid_payload',
    });
  });

  it('reads a matching version back', async () => {
    const { client, store } = createFakeClient();
    store.set('key', envelope(3));

    await expect(readReportCacheEntry(client, 'key', parseNumber)).resolves.toEqual({
      hit: true,
      value: 3,
      bytes: byteLength('{"v":1,"data":3}'),
    });
    await expect(readReportCacheValue(client, 'key', parseNumber)).resolves.toBe(3);
  });

  it('rejects a payload from another schema version without deleting it', async () => {
    const { client, store, calls } = createFakeClient();
    // Versions start at 1, so an "older" entry is one from a build that lagged a bump; a value from before the
    // envelope existed has no `v` at all (covered below as `not_enveloped`).
    store.set('older', envelope(3, reportCacheSchemaVersion + 1));
    store.set('newer', envelope(3, reportCacheSchemaVersion + 2));

    // Rolling deploy: the other build's entry is valid for it, so it must survive our read.
    for (const key of ['older', 'newer']) {
      await expect(readReportCacheEntry(client, key, parseNumber)).resolves.toMatchObject({
        hit: false,
        reason: 'version_mismatch',
      });
    }
    expect(calls.del).toEqual([]);
    expect(store.has('older')).toBe(true);
    expect(store.has('newer')).toBe(true);
  });

  it('rejects a legacy value that has no envelope', async () => {
    const { client, store } = createFakeClient();
    // Exactly what the old build wrote: the payload on its own.
    store.set('legacy', JSON.stringify({ total: 3 }));

    await expect(readReportCacheEntry(client, 'legacy', parseNumber)).resolves.toMatchObject({
      hit: false,
      reason: 'not_enveloped',
    });
  });

  it('rejects a look-alike that carries v and data but extra keys', async () => {
    const { client, store } = createFakeClient();
    store.set('lookalike', JSON.stringify({ v: 1, data: 3, total: 3 }));
    await expect(readReportCacheEntry(client, 'lookalike', parseNumber)).resolves.toMatchObject({
      hit: false,
      reason: 'not_enveloped',
    });

    store.set('bad-version', JSON.stringify({ v: '1', data: 3 }));
    await expect(readReportCacheEntry(client, 'bad-version', parseNumber)).resolves.toMatchObject({
      hit: false,
      reason: 'not_enveloped',
    });
  });

  it('deletes a value that is not JSON instead of re-parsing it on every request', async () => {
    const { client, store, calls } = createFakeClient();
    store.set('key', 'not json');

    await expect(readReportCacheEntry(client, 'key', parseNumber)).resolves.toMatchObject({
      hit: false,
      reason: 'invalid_json',
    });
    expect(calls.del).toEqual(['key']);
    expect(store.has('key')).toBe(false);
  });

  it('refuses an oversized entry before parsing it, and evicts it', async () => {
    const { client, store, calls } = createFakeClient();
    const huge = envelope('x'.repeat(200));
    store.set('key', huge);

    await expect(
      readReportCacheEntry(client, 'key', parseNumber, { maxBytes: 100 }),
    ).resolves.toMatchObject({ hit: false, reason: 'oversized', bytes: byteLength(huge) });
    expect(calls.del).toEqual(['key']);
  });

  it('measures bytes, not characters, so multi-byte labels count what they really cost', async () => {
    const { client, store } = createFakeClient();
    // 40 'č' characters: 40 code points, 80 bytes.
    const label = 'č'.repeat(40);
    store.set('key', envelope(label));

    expect(byteLength(label)).toBe(80);
    await expect(
      readReportCacheEntry(client, 'key', parseNumber, { maxBytes: 60 }),
    ).resolves.toMatchObject({ hit: false, reason: 'oversized' });
  });

  it('does not write a payload over the cap, so no reader ever has to reject it', async () => {
    const { client, calls } = createFakeClient();

    const write = await writeReportCacheEntry(client, 'key', 'x'.repeat(200), 60, { maxBytes: 100 });

    expect(write).toMatchObject({ written: false, reason: 'oversized' });
    expect(calls.set).toEqual([]);
  });

  it('does not write a payload that cannot be serialised', async () => {
    const { client, calls } = createFakeClient();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const write = await writeReportCacheEntry(client, 'key', circular, 60);

    expect(write).toEqual({ written: false, bytes: 0, reason: 'unserializable' });
    expect(calls.set).toEqual([]);
  });

  it('defaults the cap to the documented constant', async () => {
    const { client, store } = createFakeClient();
    store.set('key', envelope('x'.repeat(reportCacheMaxBytes)));

    // The envelope and the quotes push it over the cap; just below it, the entry is readable.
    await expect(readReportCacheEntry(client, 'key', parseNumber)).resolves.toMatchObject({
      hit: false,
      reason: 'oversized',
    });
    expect(reportCacheMaxBytes).toBe(256 * 1024);
  });

  it('degrades to a miss without Redis and when Redis throws', async () => {
    await expect(readReportCacheEntry(null, 'key', parseNumber)).resolves.toEqual({
      hit: false,
      reason: 'no_client',
      bytes: 0,
    });
    await expect(writeReportCacheEntry(null, 'key', 1, 60)).resolves.toEqual({
      written: false,
      bytes: 0,
      reason: 'no_client',
    });
    await expect(invalidateReportCacheEntry(null, 'key')).resolves.toBeUndefined();

    const broken: ReportCacheClient = {
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
    await expect(readReportCacheEntry(broken, 'key', parseNumber)).resolves.toEqual({
      hit: false,
      reason: 'error',
      bytes: 0,
    });
    await expect(writeReportCacheEntry(broken, 'key', 1, 60)).resolves.toEqual({
      written: false,
      bytes: byteLength(envelope(1)),
      reason: 'error',
    });
    // A failing `del` (used for eviction) must not surface either.
    await expect(invalidateReportCacheEntry(broken, 'key')).resolves.toBeUndefined();
  });

  it('treats a validator rejection as a miss, not as an exception', async () => {
    const { client, store, calls } = createFakeClient();
    store.set('key', envelope({ total: 3 }));

    await expect(readReportCacheEntry(client, 'key', parseNumber)).resolves.toMatchObject({
      hit: false,
      reason: 'invalid_payload',
    });
    // The payload is ours and may be valid for another caller/validator: it stays until the TTL.
    expect(calls.del).toEqual([]);
  });

  it('rejects Infinity and NaN, which JSON lets through as computed values', () => {
    const parsed = JSON.parse('{"v":1,"data":{"value":1e999}}') as { data: { value: number } };
    expect(parseNumber(parsed.data.value)).toBeNull();
    expect(parseNumber(Number.NaN)).toBeNull();
  });
});
