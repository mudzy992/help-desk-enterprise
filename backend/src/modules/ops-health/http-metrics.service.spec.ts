import { createHttpMetricsMiddleware, HttpMetricsService } from './http-metrics.service';

function fakeRedis() {
  const commands: Array<[string, ...unknown[]]> = [];
  const pipeline = {
    incrby: (...args: unknown[]) => (commands.push(['incrby', ...args]), pipeline),
    expire: (...args: unknown[]) => (commands.push(['expire', ...args]), pipeline),
    exec: jest.fn(async () => []),
  };
  return { commands, client: { pipeline: () => pipeline } };
}

describe('HttpMetricsService', () => {
  it('batches per-minute totals and 5xx, skipping health probes', async () => {
    const redis = fakeRedis();
    const service = new HttpMetricsService({ getClient: () => redis.client } as never);
    const minute = 29_000_000;
    service.record('/tickets', 200, minute * 60_000);
    service.record('/tickets', 503, minute * 60_000 + 1_000);
    service.record('/health/ready', 503, minute * 60_000 + 2_000);
    service.record('/reports', 500, (minute + 1) * 60_000);
    await service.flush();
    expect(redis.commands).toEqual([
      ['incrby', `ops:http:total:${minute}`, 2],
      ['expire', `ops:http:total:${minute}`, 4200],
      ['incrby', `ops:http:5xx:${minute}`, 1],
      ['expire', `ops:http:5xx:${minute}`, 4200],
      ['incrby', `ops:http:total:${minute + 1}`, 1],
      ['expire', `ops:http:total:${minute + 1}`, 4200],
      ['incrby', `ops:http:5xx:${minute + 1}`, 1],
      ['expire', `ops:http:5xx:${minute + 1}`, 4200],
    ]);
    redis.commands.length = 0;
    await service.flush();
    expect(redis.commands).toEqual([]);
  });

  it('drops the batch quietly when Redis fails', async () => {
    const service = new HttpMetricsService({
      getClient: () => ({
        pipeline: () => {
          throw new Error('down');
        },
      }),
    } as never);
    service.record('/x', 500);
    await expect(service.flush()).resolves.toBeUndefined();
  });

  it('middleware records after the response finished, without the query string', () => {
    const record = jest.fn();
    let finish: () => void = () => undefined;
    const next = jest.fn();
    createHttpMetricsMiddleware({ record })(
      { originalUrl: '/tickets?page=2' },
      { statusCode: 502, once: (_event, listener) => (finish = listener) },
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    finish();
    expect(record).toHaveBeenCalledWith('/tickets', 502);
  });
});
