import {
  readTotalDbQueries,
  readTrackedRequestCount,
  recordDbQuery,
  resetDbQueryCounters,
  takeDbQueryCount,
} from './db-query-counter';

describe('db query counter', () => {
  beforeEach(() => {
    resetDbQueryCounters();
  });

  it('counts statements per request id and drains them once', () => {
    recordDbQuery('request-1');
    recordDbQuery('request-1');
    recordDbQuery('request-2');

    expect(takeDbQueryCount('request-1')).toBe(2);
    expect(takeDbQueryCount('request-1')).toBe(0);
    expect(takeDbQueryCount('request-2')).toBe(1);
    expect(takeDbQueryCount('unknown-request')).toBe(0);
  });

  it('keeps counting statements that have no request id', () => {
    recordDbQuery(undefined);
    recordDbQuery(undefined);

    expect(readTotalDbQueries()).toBe(2);
    expect(readTrackedRequestCount()).toBe(0);
  });

  it('accumulates the process total across requests', () => {
    recordDbQuery('request-1');
    takeDbQueryCount('request-1');
    recordDbQuery('request-2');

    expect(readTotalDbQueries()).toBe(2);
  });

  it('drops the oldest entry instead of growing without bound', () => {
    for (let index = 0; index <= 10_000; index += 1) {
      recordDbQuery(`request-${index}`);
    }

    expect(readTrackedRequestCount()).toBe(10_000);
    expect(takeDbQueryCount('request-0')).toBe(0);
    expect(takeDbQueryCount('request-1')).toBe(1);
  });
});
