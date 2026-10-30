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
    recordDbQuery(
      getRequestId(),
      process.env.DB_QUERY_TRACE === 'true' ? describeQuery(args) : undefined,
    );
    return runQuery(...args);
  }) as typeof pool.query;
  return pool;
}

/** Emits only SQL operation/table labels, never statement text or bind values. */
function describeQuery(args: readonly unknown[]): string {
  const first = args[0];
  const sql =
    typeof first === 'string'
      ? first
      : typeof first === 'object' && first !== null && 'text' in first &&
          typeof first.text === 'string'
        ? first.text
        : '';
  const operation = /\b(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.exec(sql)?.[1]?.toUpperCase() ?? 'SQL';
  const table = /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:(?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][\w$]*))/i.exec(
    sql,
  );
  const tableName = table?.[1] ?? table?.[2];
  return tableName === undefined ? operation : `${operation}:${tableName}`;
}
