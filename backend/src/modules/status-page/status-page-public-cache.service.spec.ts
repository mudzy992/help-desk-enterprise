import { StatusPagePublicCacheService } from './status-page-public-cache.service';

describe('StatusPagePublicCacheService', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    status: 'ready' as const,
    connect: jest.fn().mockResolvedValue(undefined),
  } as unknown as { get: jest.Mock; set: jest.Mock; incr: jest.Mock; status: string; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    mockRedis.incr.mockReset();
  });

  it('is disabled when no Redis client is provided', () => {
    const cache = new StatusPagePublicCacheService(undefined as unknown as never);
    expect(cache.enabled).toBe(false);
  });

  it('getVersion returns 0 without Redis', async () => {
    const cache = new StatusPagePublicCacheService(undefined as unknown as never);
    expect(await cache.getVersion()).toBe(0);
  });

  it('getVersion reads and parses the version key from Redis', async () => {
    mockRedis.get.mockResolvedValue('7');
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    expect(await cache.getVersion()).toBe(7);
    expect(mockRedis.get).toHaveBeenCalledWith('status:public:cache:version');
  });

  it('getVersion returns 0 when Redis value is not a number', async () => {
    mockRedis.get.mockResolvedValue('not-a-number');
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    expect(await cache.getVersion()).toBe(0);
  });

  it('getVersion returns 0 when Redis throws', async () => {
    mockRedis.get.mockRejectedValue(new Error('down'));
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    expect(await cache.getVersion()).toBe(0);
  });

  it('bumpVersion calls incr on the version key', async () => {
    mockRedis.incr.mockResolvedValue(1);
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    await cache.bumpVersion();
    expect(mockRedis.incr).toHaveBeenCalledWith('status:public:cache:version');
  });

  it('bumpVersion does not throw when Redis throws', async () => {
    mockRedis.incr.mockRejectedValue(new Error('down'));
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    await expect(cache.bumpVersion()).resolves.toBeUndefined();
  });

  it('getPage returns null without Redis', async () => {
    const cache = new StatusPagePublicCacheService(undefined as unknown as never);
    expect(await cache.getPage(0)).toBeNull();
  });

  it('getPage reads the versioned page key from Redis', async () => {
    mockRedis.get.mockResolvedValue('{"id":"i1"}');
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    expect(await cache.getPage(3)).toBe('{"id":"i1"}');
    expect(mockRedis.get).toHaveBeenCalledWith('status:public:page:v3');
  });

  it('getPage returns null when Redis returns null', async () => {
    mockRedis.get.mockResolvedValue(null);
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    expect(await cache.getPage(1)).toBeNull();
  });

  it('setPage writes the versioned page key with TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    await cache.setPage(2, '{"id":"i1"}');
    expect(mockRedis.set).toHaveBeenCalledWith('status:public:page:v2', '{"id":"i1"}', 'EX', 30);
  });

  it('setPage does not throw when Redis throws', async () => {
    mockRedis.set.mockRejectedValue(new Error('down'));
    const cache = new StatusPagePublicCacheService(mockRedis as unknown as never);
    await expect(cache.setPage(1, '{}')).resolves.toBeUndefined();
  });
});
