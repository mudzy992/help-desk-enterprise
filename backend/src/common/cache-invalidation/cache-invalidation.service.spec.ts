import { CacheInvalidationService } from './cache-invalidation.service';

describe('CacheInvalidationService', () => {
  it('never serves a cached payload whose revision differs from database authority', async () => {
    const writeCache = jest.fn();
    const service = new CacheInvalidationService({} as never);
    await expect(service.readThrough({
      readAuthoritativeRevision: async () => 8,
      readCache: async () => ({ revision: 7, value: 'stale' }),
      loadAuthoritativeSnapshot: async () => ({ revision: 8, value: 'current' }),
      writeCache,
    })).resolves.toEqual({ value: 'current', revision: 8, source: 'authority' });
    expect(writeCache).toHaveBeenCalledWith({ revision: 8, value: 'current' });
  });

  it('uses cache only after matching an authoritative revision read', async () => {
    const load = jest.fn();
    const service = new CacheInvalidationService({} as never);
    await expect(service.readThrough({
      readAuthoritativeRevision: async () => 3,
      readCache: async () => ({ revision: 3, value: 'cached' }),
      loadAuthoritativeSnapshot: load,
      writeCache: jest.fn(),
    })).resolves.toEqual({ value: 'cached', revision: 3, source: 'cache' });
    expect(load).not.toHaveBeenCalled();
  });

  it('rejects an invalid authority revision instead of trusting cache', async () => {
    const service = new CacheInvalidationService({} as never);
    await expect(service.readThrough({
      readAuthoritativeRevision: async () => 0,
      readCache: async () => ({ revision: 0, value: 'invalid' }),
      loadAuthoritativeSnapshot: async () => ({ revision: 1, value: 'value' }),
      writeCache: jest.fn(),
    })).rejects.toMatchObject({ code: 'CACHE_INVALIDATION_REVISION_INVALID' });
  });
});
