import {
  MailProviderLimitBreaker,
  mailProviderBlockCooldowns,
  mailProviderBlockRedisKey,
  type MailProviderBlockRedis,
} from './mail-provider-limit-breaker';

/** Map-based Redis with a call counter (the breaker must not hammer it either). */
function fakeRedis(options: { readonly failing?: boolean } = {}) {
  const store = new Map<string, { readonly value: string; readonly seconds: number }>();
  const calls = { get: 0, set: 0, del: 0 };
  const redis: MailProviderBlockRedis = {
    async get(key) {
      calls.get += 1;
      if (options.failing === true) throw new Error('redis down');
      return store.get(key)?.value ?? null;
    },
    async set(key, value, _mode, seconds) {
      calls.set += 1;
      if (options.failing === true) throw new Error('redis down');
      store.set(key, { value, seconds });
      return 'OK';
    },
    async del(key) {
      calls.del += 1;
      if (options.failing === true) throw new Error('redis down');
      store.delete(key);
      return 1;
    },
  };
  return { redis, store, calls };
}

const gmailDailyLimit = Object.assign(
  new Error("Data command failed: 550-5.4.5 Daily user sending limit exceeded."),
  { code: 'EENVELOPE', responseCode: 550, response: '550-5.4.5 Daily user sending limit exceeded.' },
);

const tooManyConnections = Object.assign(new Error('421 4.7.0 Too many connections'), {
  code: 'EENVELOPE',
  responseCode: 421,
  response: '421 4.7.0 Too many connections from your IP',
});

const authFailure = Object.assign(new Error('535 Authentication unsuccessful'), {
  code: 'EAUTH',
  responseCode: 535,
});

describe('MailProviderLimitBreaker', () => {
  it('nije otvoren dok provajder radi', async () => {
    const { redis, store } = fakeRedis();
    const breaker = new MailProviderLimitBreaker(redis, () => 1_000);
    expect(await breaker.active()).toBeNull();
    expect(store.size).toBe(0);
  });

  it('otvori se na dnevni limit i zaustavi slanje do isteka hladnjaka', async () => {
    const { redis, store } = fakeRedis();
    let nowMs = 10 * 60_000;
    const breaker = new MailProviderLimitBreaker(redis, () => nowMs);

    const block = await breaker.recordFailure(gmailDailyLimit);
    expect(block?.reason).toBe('dailyLimit');
    expect(block?.blockedUntilMs).toBe(nowMs + mailProviderBlockCooldowns.dailyLimit.initialMs);
    expect(store.has(mailProviderBlockRedisKey)).toBe(true);

    // Dok traje: svako slanje bi dobilo blokadu.
    expect(await breaker.active()).toMatchObject({ reason: 'dailyLimit', consecutiveBlocks: 1 });

    // Pet sekundi prije isteka još uvijek drži.
    nowMs = block!.blockedUntilMs - 5_000;
    expect(await breaker.active()).not.toBeNull();

    // Poslije isteka propušta pokušaj i čisti ključ.
    nowMs = block!.blockedUntilMs + 1_000;
    expect(await breaker.active()).toBeNull();
    expect(store.has(mailProviderBlockRedisKey)).toBe(false);
  });

  it('ne dira mrežu za običnu grešku vjerodajnica', async () => {
    const { redis, store } = fakeRedis();
    const breaker = new MailProviderLimitBreaker(redis, () => 0);
    expect(await breaker.recordFailure(authFailure)).toBeNull();
    expect(await breaker.active()).toBeNull();
    expect(store.size).toBe(0);
  });

  it('kratkotrajno ograničenje dobija kraći hladnjak', async () => {
    const { redis } = fakeRedis();
    const breaker = new MailProviderLimitBreaker(redis, () => 0);
    const block = await breaker.recordFailure(tooManyConnections);
    expect(block?.reason).toBe('rateLimit');
    expect(block?.blockedUntilMs).toBe(mailProviderBlockCooldowns.rateLimit.initialMs);
  });

  it('svako novo odbijanje duplira hladnjak, do gornje granice', async () => {
    const { redis } = fakeRedis();
    let nowMs = 0;
    const breaker = new MailProviderLimitBreaker(redis, () => nowMs);
    const { initialMs, maxMs } = mailProviderBlockCooldowns.dailyLimit;

    const first = await breaker.recordFailure(gmailDailyLimit);
    expect(first?.blockedUntilMs).toBe(initialMs);

    nowMs = first!.blockedUntilMs + 1;
    const second = await breaker.recordFailure(gmailDailyLimit);
    expect(second?.consecutiveBlocks).toBe(2);
    expect(second?.blockedUntilMs).toBe(nowMs + initialMs * 2);

    // Nakon nekoliko odbijanja ostaje na granici (ne raste beskonačno).
    let current = second!;
    for (let index = 0; index < 6; index += 1) {
      nowMs = current.blockedUntilMs + 1;
      current = (await breaker.recordFailure(gmailDailyLimit))!;
    }
    expect(current.blockedUntilMs - nowMs).toBe(maxMs);
  });

  it('uspješno slanje vraća normalan rad', async () => {
    const { redis, store } = fakeRedis();
    let nowMs = 0;
    const breaker = new MailProviderLimitBreaker(redis, () => nowMs);
    const block = await breaker.recordFailure(gmailDailyLimit);
    nowMs = block!.blockedUntilMs + 1;
    await breaker.recordSuccess();
    expect(store.has(mailProviderBlockRedisKey)).toBe(false);
    expect(await breaker.active()).toBeNull();
  });

  it('stanje druge instance (API/worker) se preuzima iz Redisa', async () => {
    const shared = fakeRedis();
    const workerBreaker = new MailProviderLimitBreaker(shared.redis, () => 1_000);
    await workerBreaker.recordFailure(gmailDailyLimit);

    const apiBreaker = new MailProviderLimitBreaker(shared.redis, () => 2_000);
    expect(await apiBreaker.active()).toMatchObject({ reason: 'dailyLimit' });
  });

  it('bez Redisa i dalje zaustavlja oluju u procesu', async () => {
    const failing = fakeRedis({ failing: true });
    const breaker = new MailProviderLimitBreaker(failing.redis, () => 0);
    const block = await breaker.recordFailure(gmailDailyLimit);
    expect(block).not.toBeNull();
    expect(await breaker.active()).toMatchObject({ reason: 'dailyLimit' });
  });

  it('čita Redis najviše jednom u 5 s, a ne po svakoj poruci', async () => {
    const { redis, calls } = fakeRedis();
    let nowMs = 0;
    const breaker = new MailProviderLimitBreaker(redis, () => nowMs);
    await breaker.active();
    await breaker.active();
    nowMs = 1_000;
    await breaker.active();
    expect(calls.get).toBe(1);
    nowMs = 6_000;
    await breaker.active();
    expect(calls.get).toBe(2);
  });

  it('broji preskočena slanja i ne piše po Redisu za svako', async () => {
    const { redis, calls } = fakeRedis();
    let nowMs = 0;
    const breaker = new MailProviderLimitBreaker(redis, () => nowMs);
    await breaker.recordFailure(gmailDailyLimit);
    const before = calls.set;
    for (let index = 0; index < 25; index += 1) await breaker.countSuppressed();
    expect(calls.set).toBe(before + 1);
    expect(await breaker.readForMonitoring()).toMatchObject({ suppressedTotal: 25 });

    nowMs = 60_000;
    await breaker.countSuppressed();
    expect(await breaker.readForMonitoring()).toMatchObject({ suppressedTotal: 26 });
  });

  it('neispravan zapis u Redisu se baca, ne čita kao blokada', async () => {
    const { redis, store } = fakeRedis();
    store.set(mailProviderBlockRedisKey, { value: '{nije json', seconds: 60 });
    const breaker = new MailProviderLimitBreaker(redis, () => 0);
    expect(await breaker.active()).toBeNull();
    expect(store.has(mailProviderBlockRedisKey)).toBe(false);
  });

  it('readForMonitoring vraća null kad je blokada istekla', async () => {
    const { redis } = fakeRedis();
    let nowMs = 0;
    const breaker = new MailProviderLimitBreaker(redis, () => nowMs);
    const block = await breaker.recordFailure(tooManyConnections);
    expect(await breaker.readForMonitoring()).not.toBeNull();
    nowMs = block!.blockedUntilMs + 1;
    expect(await breaker.readForMonitoring()).toBeNull();
  });
});
