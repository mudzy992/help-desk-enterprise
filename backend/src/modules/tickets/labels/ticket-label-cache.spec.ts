import {
  parseTicketLabel,
  readTicketLabels,
  ticketLabelCacheKey,
  ticketLabelCacheTtlSeconds,
  ticketLabelKinds,
  writeTicketLabels,
  type TicketLabelCacheClient,
  type TicketLabelKind,
} from './ticket-label-cache';

class FakeRedis implements TicketLabelCacheClient {
  readonly store = new Map<string, string>();
  readonly writes: { readonly key: string; readonly ttl: number }[] = [];
  failReads = false;
  failWrites = false;

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (this.failReads) {
      throw new Error('redis is down');
    }
    return keys.map((key) => this.store.get(key) ?? null);
  }

  async set(
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
  ): Promise<unknown> {
    if (this.failWrites) {
      throw new Error('redis is down');
    }
    expect(mode).toBe('EX');
    this.store.set(key, value);
    this.writes.push({ key, ttl: ttlSeconds });
    return 'OK';
  }
}

describe('ticketLabelCacheKey', () => {
  it('namespaces a label by kind and id', () => {
    expect(ticketLabelCacheKey('group', 'g-it')).toBe('label:group:g-it');
  });

  it('covers exactly the five catalogues a list resolves', () => {
    expect([...ticketLabelKinds]).toEqual([
      'user',
      'group',
      'formVersion',
      'organizationalUnit',
      'service',
    ]);
  });
});

describe('parseTicketLabel', () => {
  it('accepts a stored row of the matching shape', () => {
    expect(
      parseTicketLabel('user', JSON.stringify({ id: 'u-1', displayName: 'Ana' })),
    ).toEqual({ hit: true, row: { id: 'u-1', displayName: 'Ana' } });
  });

  it('treats the JSON literal null as "this row does not exist"', () => {
    expect(parseTicketLabel('service', 'null')).toEqual({ hit: true, row: null });
  });

  it.each([
    ['broken json', '{not json'],
    ['another shape', JSON.stringify({ id: 'u-1' })],
    ['the wrong field type', JSON.stringify({ id: 'u-1', displayName: 7 })],
    ['no id', JSON.stringify({ displayName: 'Ana' })],
    ['an empty id', JSON.stringify({ id: '', displayName: 'Ana' })],
    ['a bare string', JSON.stringify('u-1')],
  ])('counts %s as a miss', (_label, raw) => {
    expect(parseTicketLabel('user', raw)).toEqual({ hit: false });
  });

  it('checks the fields of the kind it was asked about', () => {
    const row = JSON.stringify({ id: 'fv-1', version: 3 });
    expect(parseTicketLabel('formVersion', row)).toEqual({
      hit: true,
      row: { id: 'fv-1', version: 3 },
    });
    // `version` is not a field of a service label, so the payload is not trusted.
    expect(parseTicketLabel('service', row)).toEqual({ hit: false });
  });

  it('keeps the origin unit path under the field the row uses', () => {
    expect(
      parseTicketLabel(
        'organizationalUnit',
        JSON.stringify({ id: 'ou-1', name: 'IT', ouPath: '/IT' }),
      ).hit,
    ).toBe(true);
  });
});

describe('readTicketLabels', () => {
  it('is a miss for every id without a client', async () => {
    const hits = await readTicketLabels(null, 'user', ['u-1']);
    expect(hits.size).toBe(0);
  });

  it('is a miss when there is nothing to look up', async () => {
    const hits = await readTicketLabels(new FakeRedis(), 'user', []);
    expect(hits.size).toBe(0);
  });

  it('separates hits, negative hits and unknown ids in one round trip', async () => {
    const redis = new FakeRedis();
    redis.store.set(
      ticketLabelCacheKey('user', 'u-1'),
      JSON.stringify({ id: 'u-1', displayName: 'Ana' }),
    );
    redis.store.set(ticketLabelCacheKey('user', 'u-gone'), 'null');

    const hits = await readTicketLabels(redis, 'user', ['u-1', 'u-gone', 'u-new']);

    expect(hits.get('u-1')).toEqual({ id: 'u-1', displayName: 'Ana' });
    expect(hits.get('u-gone')).toBeNull();
    expect(hits.has('u-new')).toBe(false);
  });

  it('degrades to a miss when redis throws', async () => {
    const redis = new FakeRedis();
    redis.failReads = true;
    const hits = await readTicketLabels(redis, 'group', ['g-1']);
    expect(hits.size).toBe(0);
  });

  it('does not fail on a payload written by an older shape', async () => {
    const redis = new FakeRedis();
    redis.store.set(ticketLabelCacheKey('group', 'g-1'), '{"id":"g-1"}');
    const hits = await readTicketLabels(redis, 'group', ['g-1']);
    expect(hits.size).toBe(0);
  });
});

describe('writeTicketLabels', () => {
  it('stores rows and the absence of a row under the sixty second TTL', async () => {
    const redis = new FakeRedis();
    await writeTicketLabels(redis, 'group', [
      { id: 'g-1', row: { id: 'g-1', name: 'IT podrška' } },
      { id: 'g-gone', row: null },
    ]);

    expect(ticketLabelCacheTtlSeconds).toBe(60);
    expect(redis.writes.map((write) => write.key)).toEqual([
      'label:group:g-1',
      'label:group:g-gone',
    ]);
    expect(redis.writes.every((write) => write.ttl === 60)).toBe(true);
    expect(redis.store.get('label:group:g-1')).toBe(
      JSON.stringify({ id: 'g-1', name: 'IT podrška' }),
    );
    expect(redis.store.get('label:group:g-gone')).toBe('null');
  });

  it('does nothing without a client or without entries', async () => {
    const redis = new FakeRedis();
    await writeTicketLabels(null, 'user', [{ id: 'u-1', row: null }]);
    await writeTicketLabels(redis, 'user', []);
    expect(redis.writes).toHaveLength(0);
  });

  it('never lets a write failure reach the caller', async () => {
    const redis = new FakeRedis();
    redis.failWrites = true;
    await expect(
      writeTicketLabels(redis, 'service', [{ id: 's-1', row: { id: 's-1', name: 'VPN' } }]),
    ).resolves.toBeUndefined();
  });

  it('round-trips every kind through read and write', async () => {
    const redis = new FakeRedis();
    const rows: Record<TicketLabelKind, Record<string, unknown> & { id: string }> = {
      user: { id: 'u-1', displayName: 'Ana' },
      group: { id: 'g-1', name: 'IT' },
      formVersion: { id: 'fv-1', version: 2 },
      organizationalUnit: { id: 'ou-1', name: 'IT', ouPath: '/IT' },
      service: { id: 's-1', name: 'VPN' },
    };
    for (const kind of ticketLabelKinds) {
      await writeTicketLabels(redis, kind, [{ id: rows[kind].id as string, row: rows[kind] }]);
    }
    for (const kind of ticketLabelKinds) {
      const hits = await readTicketLabels(redis, kind, [rows[kind].id as string]);
      expect(hits.get(rows[kind].id as string)).toEqual(rows[kind]);
    }
  });
});
