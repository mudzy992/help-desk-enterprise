import { OptimisticConcurrencyService, formatVersionEtag, parseIfMatch } from './optimistic-concurrency.service';

describe('optimistic concurrency contract', () => {
  const service = new OptimisticConcurrencyService();

  it.each([undefined, '', '*', 'W/"v1"', '"v0"', '"v01"', '"v1", "v2"', ['"v1"']])(
    'rejects absent, weak, wildcard, malformed or multi-value If-Match: %p',
    (header) => {
      expect(() => parseIfMatch(header)).toThrow();
    },
  );

  it('round-trips a strong bounded version ETag', () => {
    expect(parseIfMatch(formatVersionEtag(42))).toBe(42);
  });

  it('returns the incremented version and response ETag', async () => {
    await expect(service.execute({
      ifMatch: '"v4"',
      mutate: async (expected) => ({ value: { expected }, version: 5 }),
      readCurrentVersion: async () => 4,
    })).resolves.toEqual({ value: { expected: 4 }, version: 5, etag: '"v5"' });
  });

  it('returns a stable stale-write error with the current ETag', async () => {
    await expect(service.execute({
      ifMatch: '"v2"', mutate: async () => null, readCurrentVersion: async () => 7,
    })).rejects.toMatchObject({ code: 'OPTIMISTIC_STALE_WRITE', httpStatus: 412, currentEtag: '"v7"' });
  });

  it('distinguishes an authorized missing resource and rejects broken version increments', async () => {
    await expect(service.execute({
      ifMatch: '"v2"', mutate: async () => null, readCurrentVersion: async () => null,
    })).rejects.toMatchObject({ code: 'OPTIMISTIC_RESOURCE_NOT_FOUND', httpStatus: 404 });
    await expect(service.execute({
      ifMatch: '"v2"', mutate: async () => ({ value: true, version: 4 }), readCurrentVersion: async () => 2,
    })).rejects.toMatchObject({ code: 'OPTIMISTIC_VERSION_TRANSITION_INVALID', httpStatus: 500 });
  });
});
