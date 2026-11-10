import { Pool } from 'pg';
import { runWithRequestId } from '../request-context/request-context.storage';
import {
  readTotalDbQueries,
  resetDbQueryCounters,
  takeDbQueryCount,
  takeDbQueryTrace,
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

  it('records only operation/table labels when query tracing is explicitly enabled', async () => {
    const previous = process.env.DB_QUERY_TRACE;
    process.env.DB_QUERY_TRACE = 'true';
    try {
      const pool = createInstrumentedPool('postgresql://localhost:5432/unused');
      await runWithRequestId('request-trace', async () => {
        await pool.query(
          'select "id" from "public"."Ticket" where "id" = $1',
          ['secret-id'],
        );
      });

      expect(takeDbQueryTrace('request-trace')).toEqual(['SELECT:Ticket']);
    } finally {
      if (previous === undefined) delete process.env.DB_QUERY_TRACE;
      else process.env.DB_QUERY_TRACE = previous;
    }
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
