import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { getRequestId } from '../request-context/request-context.storage';
import { recordDbQuery } from './db-query-counter';

/**
 * Builds the pg pool Prisma talks through and counts every statement it runs.
 *
 * `@prisma/adapter-pg` executes statements on the pool it is given, so wrapping
 * `pool.query` measures the request path without touching Prisma internals or
 * adding middleware to the query pipeline.
 *
 * Known limitation: statements inside an interactive transaction run on a
 * dedicated client taken from the pool and are not counted here, so the value
 * is a lower bound. Phase 0 needs a comparable number between phases, not an
 * exact statement log.
 */
export function createInstrumentedPool(config: string | PoolConfig): Pool {
  const pool = new Pool(
    typeof config === 'string' ? { connectionString: config } : config,
  );
  const runQuery = pool.query.bind(pool);
  pool.query = ((...args: Parameters<typeof runQuery>) => {
    recordDbQuery(getRequestId());
    return runQuery(...args);
  }) as typeof pool.query;
  return pool;
}
