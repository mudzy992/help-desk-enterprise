import { EventEmitter } from 'node:events';
import {
  readTotalDbQueries,
  recordDbQuery,
  resetDbQueryCounters,
} from '../database/db-query-counter';
import {
  RequestMetricsMiddleware,
  readRequestMetricsOptions,
} from './request-metrics.middleware';

type FakeResponse = EventEmitter & { statusCode: number };

function createResponse(): FakeResponse {
  const response = new EventEmitter() as FakeResponse;
  response.statusCode = 200;
  return response;
}

function createLogger(): {
  readonly log: jest.Mock;
  readonly warn: jest.Mock;
} {
  return { log: jest.fn(), warn: jest.fn() };
}

function lastLoggedMessage(logger: { readonly log: jest.Mock }): string {
  const calls = logger.log.mock.calls;
  const call = calls[calls.length - 1];
  return String(call?.[0] ?? '');
}

describe('RequestMetricsMiddleware', () => {
  beforeEach(() => {
    resetDbQueryCounters();
  });

  it('logs query count, duration and route after the response finishes', () => {
    const logger = createLogger();
    const response = createResponse();
    const middleware = new RequestMetricsMiddleware(logger, {
      enabled: true,
      warnAboveQueries: 3,
      warnEnabled: false,
    });

    middleware.use(
      {
        headers: { 'x-request-id': 'request-1' },
        method: 'GET',
        originalUrl: '/tickets?page=2',
      },
      response,
      () => undefined,
    );
    recordDbQuery('request-1');
    recordDbQuery('request-1');
    response.emit('finish');

    expect(logger.log).toHaveBeenCalledTimes(1);
    const message = lastLoggedMessage(logger);
    expect(message).toContain('db_queries_per_request=2');
    expect(message).toContain('status=200');
    expect(message).toContain('method=GET');
    expect(message).toContain('path=/tickets');
    expect(message).not.toContain('page=2');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('drains the counter so a request id cannot be counted twice', () => {
    const logger = createLogger();
    const response = createResponse();
    const middleware = new RequestMetricsMiddleware(logger, {
      enabled: true,
      warnAboveQueries: 3,
      warnEnabled: false,
    });

    middleware.use({ headers: {}, method: 'GET', url: '/' }, response, () => undefined);
    recordDbQuery(undefined);
    response.emit('finish');

    expect(lastLoggedMessage(logger)).toContain('db_queries_per_request=0');
    expect(readTotalDbQueries()).toBe(1);
  });

  it('warns only when the query budget warning is enabled', () => {
    const logger = createLogger();
    const response = createResponse();
    const middleware = new RequestMetricsMiddleware(logger, {
      enabled: true,
      warnAboveQueries: 1,
      warnEnabled: true,
    });

    middleware.use(
      { headers: { 'x-request-id': 'request-1' }, method: 'GET', url: '/tickets' },
      response,
      () => undefined,
    );
    recordDbQuery('request-1');
    recordDbQuery('request-1');
    response.emit('finish');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const warning = String(logger.warn.mock.calls[0]?.[0]);
    expect(warning).toContain('query_budget_exceeded');
    expect(warning).toContain('request_id=request-1');
    expect(warning).toContain('path=/tickets');
  });

  it('is a no-op passthrough when disabled', () => {
    const logger = createLogger();
    const response = createResponse();
    const middleware = new RequestMetricsMiddleware(logger, {
      enabled: false,
      warnAboveQueries: 3,
      warnEnabled: false,
    });
    const next = jest.fn();

    middleware.use({ headers: {}, method: 'GET', url: '/' }, response, next);
    response.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalled();
  });
});

describe('readRequestMetricsOptions', () => {
  it('keeps the defaults for an empty environment', () => {
    expect(readRequestMetricsOptions({})).toEqual({
      enabled: true,
      warnAboveQueries: 3,
      warnEnabled: false,
    });
  });

  it('parses overrides and ignores unusable numbers', () => {
    expect(
      readRequestMetricsOptions({
        DB_QUERY_METRICS: 'false',
        DB_QUERY_BUDGET: '7',
        DB_QUERY_BUDGET_WARN: 'true',
      }),
    ).toEqual({ enabled: false, warnAboveQueries: 7, warnEnabled: true });

    expect(readRequestMetricsOptions({ DB_QUERY_BUDGET: 'not-a-number' })).toEqual({
      enabled: true,
      warnAboveQueries: 3,
      warnEnabled: false,
    });
  });
});
