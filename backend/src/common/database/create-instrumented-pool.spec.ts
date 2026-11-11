import { Pool } from 'pg';
import { runWithRequestId } from '../request-context/request-context.storage';
import {
  readTotalDbQueries,
  resetDbQueryCounters,
  takeDbQueryCount,
} from './db-query-counter';
import { createInstrumentedPool } from './create-instrumented-pool';

describe('createInstrumentedPool', () => {
  let runQuery: jest.SpyInstance;

  beforeEach(() => {
    resetDbQueryCounters();
    runQuery = jest
      .spyOn(Pool.prototype, 'query')
      .mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }) as never);
  });

  afterEach(() => {
    runQuery.mockRestore();
  });

  it('counts statements against the active request id', async () => {
    const pool = createInstrumentedPool({
      connectionString: 'postgresql://localhost:5432/unused',
      connectionTimeoutMillis: 1,
    });

    await runWithRequestId('request-1', async () => {
      await pool.query('select 1');
      await pool.query('select 2');
    });
    await pool.query('select 3');

    expect(takeDbQueryCount('request-1')).toBe(2);
    expect(readTotalDbQueries()).toBe(3);
    expect(runQuery).toHaveBeenCalledTimes(3);
  });

  it('accepts a bare connection string like the previous adapter call', () => {
    const pool = createInstrumentedPool('postgresql://localhost:5432/unused');

    expect(pool).toBeInstanceOf(Pool);
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('still executes the statement when the counter runs', async () => {
    const pool = createInstrumentedPool('postgresql://localhost:5432/unused');

    await expect(pool.query('select 1')).resolves.toEqual({
      rows: [],
      rowCount: 0,
    });
  });
});
