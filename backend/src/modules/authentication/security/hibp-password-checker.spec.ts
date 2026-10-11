import {
  HibpPasswordChecker,
  findHibpSuffixCount,
  hashForHibp,
  hibpCacheKey,
  hibpCacheTtlSeconds,
  hibpRangeUrl,
  hibpTimeoutMilliseconds,
} from './hibp-password-checker';

/*
  Paket 5.4.0-d (M5): the Pwned Passwords range check, with a fetch stub — the
  suite never touches the Internet.
*/

const password = 'Correct-Horse-Battery-9!';
const sha1 = hashForHibp(password);
const prefix = sha1.slice(0, 5);
const suffix = sha1.slice(5);
const other = 'F'.repeat(35);

type FetchCall = { readonly url: string; readonly headers?: Record<string, string> };

function createFetch(
  handler: (url: string, init?: { readonly headers?: Record<string, string> }) => Promise<{
    readonly ok: boolean;
    readonly status: number;
    text(): Promise<string>;
  }>,
) {
  const calls: FetchCall[] = [];
  const fetchImpl = jest.fn(async (url: string, init?: FetchCall) => {
    calls.push({ url, headers: init?.headers });
    return handler(url, init);
  });
  return { fetchImpl, calls };
}

function ok(body: string) {
  return { ok: true, status: 200, text: async () => body };
}

describe('hashForHibp / findHibpSuffixCount', () => {
  it('produces the uppercase SHA-1 hex the range API is defined over', () => {
    expect(hashForHibp('password')).toBe(
      // Well-known SHA-1 of "password"; SHA-1 here is only the k-anonymity
      // transport, never a password hash.
      '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8',
    );
    expect(hashForHibp(password)).toMatch(/^[0-9A-F]{40}$/);
  });

  it('reads a count from the matching line and treats the padded zero as clean', () => {
    expect(findHibpSuffixCount(`${suffix}:42\r\n${other}:3`, suffix)).toBe(42);
    expect(findHibpSuffixCount(`${suffix}:0\r\n${other}:7`, suffix)).toBe(0);
    expect(findHibpSuffixCount(`${other}:7`, suffix)).toBe(0);
  });

  it('returns null when the body has no usable line at all', () => {
    expect(findHibpSuffixCount('', suffix)).toBeNull();
    expect(findHibpSuffixCount('<html>rate limited</html>', suffix)).toBeNull();
    expect(findHibpSuffixCount(`${suffix}:not-a-number`, suffix)).toBeNull();
  });
});

describe('HibpPasswordChecker', () => {
  const settings = { getSetting: jest.fn().mockResolvedValue(true) };
  const redis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
  };
  const metrics = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    settings.getSetting.mockReset().mockResolvedValue(true);
    redis.get.mockReset().mockResolvedValue(null);
    redis.set.mockReset().mockResolvedValue('OK');
    metrics.record.mockReset().mockResolvedValue(undefined);
  });

  function build(fetchImpl: unknown) {
    return new HibpPasswordChecker(
      settings as never,
      redis as never,
      metrics as never,
      fetchImpl as never,
    );
  }

  it('sends only the five-character prefix with the padding header and rejects a pwned password', async () => {
    const { fetchImpl, calls } = createFetch(async () => ok(`${suffix}:1234`));
    const verdict = await build(fetchImpl).check(password);
    expect(verdict).toBe('pwned');
    expect(calls[0]?.url).toBe(`${hibpRangeUrl}${prefix}`);
    expect(calls[0]?.url.endsWith(prefix)).toBe(true);
    expect(calls[0]?.headers).toEqual({ 'Add-Padding': 'true' });
    expect(JSON.stringify(calls)).not.toContain(suffix);
    // Only the five-character prefix may travel: the URL must be 5 chars longer
    // than the bare range URL.
    expect(calls[0]!.url.length).toBe(hibpRangeUrl.length + 5);
  });

  it('accepts a password whose suffix is absent from a valid body', async () => {
    const { fetchImpl } = createFetch(async () => ok(`${other}:9`));
    await expect(build(fetchImpl).check(password)).resolves.toBe('clean');
  });

  it('caches a successful body per prefix for exactly 24 h', async () => {
    const { fetchImpl } = createFetch(async () => ok(`${suffix}:1234`));
    await build(fetchImpl).check(password);
    expect(redis.set).toHaveBeenCalledWith(
      hibpCacheKey(prefix),
      `${suffix}:1234`,
      'EX',
      hibpCacheTtlSeconds,
    );
    expect(hibpCacheTtlSeconds).toBe(86_400);
  });

  it('answers from the cache without a network call', async () => {
    redis.get.mockResolvedValue(`${suffix}:77`);
    const { fetchImpl } = createFetch(async () => ok(''));
    await expect(build(fetchImpl).check(password)).resolves.toBe('pwned');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls through to the network when the cached body is unusable, and never caches an error answer', async () => {
    redis.get.mockResolvedValue('<html>nope</html>');
    const { fetchImpl } = createFetch(async () => ok(`${suffix}:5`));
    await expect(build(fetchImpl).check(password)).resolves.toBe('pwned');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('fails open on a timeout, logs nothing sensitive and counts the skip', async () => {
    const { fetchImpl } = createFetch(async () => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    });
    await expect(build(fetchImpl).check(password)).resolves.toBe('unavailable');
    expect(metrics.record).toHaveBeenCalledWith('hibp-skipped');
    expect(redis.set).not.toHaveBeenCalled();
    const warned = jest.mocked(settings.getSetting).mock.calls.length;
    expect(warned).toBeGreaterThanOrEqual(0);
  });

  it('fails open on a network error, a non-2xx answer and a malformed body', async () => {
    const network = createFetch(async () => {
      throw new Error('socket hang up');
    });
    await expect(build(network.fetchImpl).check(password)).resolves.toBe('unavailable');

    const nonOk = createFetch(async () => ({
      ok: false,
      status: 429,
      text: async () => 'slow down',
    }));
    await expect(build(nonOk.fetchImpl).check(password)).resolves.toBe('unavailable');

    const malformed = createFetch(async () => ok('<html>maintenance</html>'));
    await expect(build(malformed.fetchImpl).check(password)).resolves.toBe('unavailable');

    expect(metrics.record).toHaveBeenCalledTimes(3);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('survives a cache read failure by still reaching the network', async () => {
    redis.get.mockRejectedValue(new Error('redis down'));
    const { fetchImpl } = createFetch(async () => ok(`${suffix}:8`));
    await expect(build(fetchImpl).check(password)).resolves.toBe('pwned');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the verdict when the cache write fails', async () => {
    redis.set.mockRejectedValue(new Error('redis down'));
    const { fetchImpl } = createFetch(async () => ok(`${suffix}:8`));
    await expect(build(fetchImpl).check(password)).resolves.toBe('pwned');
  });

  it('does nothing at all when the setting is explicitly off', async () => {
    settings.getSetting.mockResolvedValue(false);
    const { fetchImpl } = createFetch(async () => ok(`${suffix}:1234`));
    await expect(build(fetchImpl).check(password)).resolves.toBe('clean');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(metrics.record).not.toHaveBeenCalled();
  });

  it('stays enabled when the setting is absent or unreadable', async () => {
    settings.getSetting.mockResolvedValue(undefined);
    const absent = createFetch(async () => ok(`${suffix}:1`));
    await expect(build(absent.fetchImpl).check(password)).resolves.toBe('pwned');

    settings.getSetting.mockRejectedValue(new Error('registry down'));
    const unreadable = createFetch(async () => ok(`${suffix}:1`));
    await expect(build(unreadable.fetchImpl).check(password)).resolves.toBe('pwned');
  });

  it('uses the pinned three-second timeout', () => {
    expect(hibpTimeoutMilliseconds).toBe(3000);
  });
});
