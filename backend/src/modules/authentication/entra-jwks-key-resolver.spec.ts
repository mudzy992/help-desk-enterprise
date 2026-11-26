import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { createEntraJwksKeyResolver, entraJwksConstants } from './entra-jwks-key-resolver';

/*
  W2.19 (`BA-authentication-06`): the acceptance list from the audit, one test each —
  timeout, cache hit, key rotation / unknown `kid`, and malformed/oversized answer.
  The resolver is the only place that talks to the JWKS endpoint, so these are the
  tests that keep a Microsoft blip from turning into an unbounded sign-in.
*/
describe('Entra JWKS key resolver (W2.19)', () => {
  const jwksUrl = 'https://login.microsoftonline.com/tenant/discovery/v2.0/keys';
  const otherUrl = 'https://login.microsoftonline.com/other/discovery/v2.0/keys';

  const keyPairs = new Map<string, { publicKey: KeyObject; privateKey: KeyObject }>();
  function keyFor(kid: string): { publicKey: KeyObject; privateKey: KeyObject } {
    const cached = keyPairs.get(kid);
    if (cached !== undefined) return cached;
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    keyPairs.set(kid, pair);
    return pair;
  }

  function jwksDocument(...kids: string[]): unknown {
    return {
      keys: kids.map((kid) => ({ ...keyFor(kid).publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' })),
    };
  }

  function jsonResponse(body: string, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? String(Buffer.byteLength(body)) : null) },
      text: async () => body,
    } as unknown as Response;
  }

  function setup(options: {
    readonly fetchImplementation: typeof fetch;
    readonly timeoutMilliseconds?: number;
    readonly cacheTtlMilliseconds?: number;
    readonly maxStaleMilliseconds?: number;
    readonly maxDocumentBytes?: number;
    readonly now?: () => number;
  }) {
    const warnings: string[] = [];
    const resolver = createEntraJwksKeyResolver({
      fetchImplementation: options.fetchImplementation,
      fetchTimeoutMilliseconds: options.timeoutMilliseconds,
      cacheTtlMilliseconds: options.cacheTtlMilliseconds,
      maxStaleMilliseconds: options.maxStaleMilliseconds,
      maxDocumentBytes: options.maxDocumentBytes,
      now: options.now,
      logger: { warn: (message: string) => warnings.push(message) },
    });
    return { resolver, warnings };
  }

  it('aborts a stalled endpoint instead of holding the sign-in open', async () => {
    // The mock hangs until the resolver's AbortController fires, then rejects the
    // way `fetch` does for an aborted request.
    const fetchImplementation = jest.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')));
      }),
    ) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver } = setup({ fetchImplementation, timeoutMilliseconds: 10 });

    const startedAt = Date.now();
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-1' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(resolver.stats().timeouts).toBe(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      jwksUrl,
      expect.objectContaining({ method: 'GET', signal: expect.anything() }),
    );
  });

  it('serves a login burst from one fetch, and refreshes only after the TTL', async () => {
    let time = 1_000;
    const fetchImplementation = jest.fn(async () => jsonResponse(JSON.stringify(jwksDocument('kid-1')))) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver } = setup({
      fetchImplementation,
      cacheTtlMilliseconds: 60_000,
      now: () => time,
    });

    await resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    await resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    await resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(resolver.stats()).toMatchObject({ fetches: 1, cacheHits: 2 });

    time += 60_001;
    await resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache per jwks URL, never across tenants', async () => {
    const fetchImplementation = jest.fn(async (url: string) =>
      jsonResponse(JSON.stringify(jwksDocument(url === jwksUrl ? 'kid-1' : 'kid-2'))),
    ) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver } = setup({ fetchImplementation });

    await resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    await resolver.resolve({ jwksUrl: otherUrl, keyId: 'kid-2' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    // A `kid` from one tenant never resolves against another tenant's document.
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-2' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('picks up a rotated key on the first token that carries the new kid', async () => {
    let time = 1_000;
    let current = jwksDocument('kid-old');
    const fetchImplementation = jest.fn(async () => jsonResponse(JSON.stringify(current))) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver } = setup({ fetchImplementation, now: () => time, cacheTtlMilliseconds: 60_000 });

    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-old' })).resolves.toBeDefined();
    current = jwksDocument('kid-old', 'kid-new');

    // Still inside the TTL, but the cooldown has passed: the rotation is picked up
    // on the first token that carries the new `kid`, without waiting for the TTL.
    time += 40_000;
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-new' })).resolves.toBeDefined();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(resolver.stats().unknownKeyRefreshes).toBe(1);

    // The refreshed document is the cache now: the next call is free.
    await resolver.resolve({ jwksUrl, keyId: 'kid-new' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('refuses an unknown kid and does not turn random kids into a fetch amplifier', async () => {
    let time = 1_000;
    const fetchImplementation = jest.fn(async () => jsonResponse(JSON.stringify(jwksDocument('kid-1')))) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver } = setup({ fetchImplementation, now: () => time, cacheTtlMilliseconds: 60_000 });

    // Cold cache: the fresh document already answered the question, so a bogus
    // `kid` costs exactly one fetch, not two.
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-missing' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    // After the cooldown one refresh is allowed …
    time += 40_000;
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-missing' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);

    // … and a burst of made-up kids inside the cooldown is refused from the cache.
    time += 1_000;
    for (const kid of ['x', 'y', 'z', 'w', 'v']) {
      await expect(resolver.resolve({ jwksUrl, keyId: kid })).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    }
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh between concurrent sign-ins on a cold cache', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const gate = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchImplementation = jest.fn(() => gate) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver } = setup({ fetchImplementation });

    const first = resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    const second = resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    resolveFetch(jsonResponse(JSON.stringify(jwksDocument('kid-1'))));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('refuses a malformed document, an oversized one, and a non-2xx answer', async () => {
    const malformed = setup({
      fetchImplementation: jest.fn(async () => jsonResponse('{"keys": "not-an-array"}')) as unknown as jest.MockedFunction<typeof fetch>,
    });
    await expect(malformed.resolver.resolve({ jwksUrl, keyId: 'kid-1' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });

    const brokenJson = setup({
      fetchImplementation: jest.fn(async () => jsonResponse('{not json')) as unknown as jest.MockedFunction<typeof fetch>,
    });
    await expect(brokenJson.resolver.resolve({ jwksUrl, keyId: 'kid-1' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });

    // 2 KB ceiling: the document below is larger and must never be parsed.
    const oversized = setup({
      fetchImplementation: jest.fn(async () => jsonResponse(`${JSON.stringify(jwksDocument('kid-1'))}${' '.repeat(4096)}`)) as unknown as jest.MockedFunction<typeof fetch>,
      maxDocumentBytes: 2 * 1024,
    });
    await expect(oversized.resolver.resolve({ jwksUrl, keyId: 'kid-1' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });

    const failing = setup({
      fetchImplementation: jest.fn(async () => jsonResponse('', 503)) as unknown as jest.MockedFunction<typeof fetch>,
    });
    await expect(failing.resolver.resolve({ jwksUrl, keyId: 'kid-1' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
  });

  it('does not cache a failed or malformed fetch, so the next sign-in retries', async () => {
    const responses = [
      jsonResponse('{not json'),
      jsonResponse(JSON.stringify(jwksDocument('kid-1'))),
    ];
    const fetchImplementation = jest.fn(async () => responses.shift()!) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver } = setup({ fetchImplementation });

    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-1' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-1' })).resolves.toBeDefined();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('serves the cached document through a transport outage, but not forever', async () => {
    let time = 1_000;
    let failing = false;
    const fetchImplementation = jest.fn(async () => {
      if (failing) throw new Error('socket hang up');
      return jsonResponse(JSON.stringify(jwksDocument('kid-1')));
    }) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver, warnings } = setup({
      fetchImplementation,
      cacheTtlMilliseconds: 60_000,
      maxStaleMilliseconds: 120_000,
      now: () => time,
    });

    await resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    failing = true;

    // Inside the stale window: the issuer's published keys still work, so Entra
    // sign-in survives a Microsoft/network blip.
    time += 90_000;
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-1' })).resolves.toBeDefined();
    expect(resolver.stats().staleServed).toBe(1);
    expect(warnings[0]).toContain('serving the cached document');

    // Past the window the answer is fail-closed again.
    time += 200_000;
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-1' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
  });

  it('never falls back to a cached document when the new answer is malformed', async () => {
    let broken = false;
    let time = 1_000;
    const fetchImplementation = jest.fn(async () =>
      broken ? jsonResponse('{"keys": 42}') : jsonResponse(JSON.stringify(jwksDocument('kid-1'))),
    ) as unknown as jest.MockedFunction<typeof fetch>;
    const { resolver } = setup({ fetchImplementation, cacheTtlMilliseconds: 60_000, now: () => time });

    await resolver.resolve({ jwksUrl, keyId: 'kid-1' });
    broken = true;
    time += 40_000;
    // Force a refresh through an unknown kid: a broken document must not be
    // answered with the older keys.
    await expect(resolver.resolve({ jwksUrl, keyId: 'kid-2' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
    expect(resolver.stats().staleServed).toBe(0);
  });

  it('publishes defaults that keep the sign-in bounded', () => {
    expect(entraJwksConstants.fetchTimeoutMilliseconds).toBeLessThanOrEqual(10_000);
    expect(entraJwksConstants.cacheTtlMilliseconds).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(entraJwksConstants.maxDocumentBytes).toBeLessThanOrEqual(1024 * 1024);
  });
});
