export const databasePoolConstants = {
  environmentKeys: {
    max: 'DB_POOL_MAX',
    idleTimeoutMs: 'DB_POOL_IDLE_TIMEOUT_MS',
    connectionTimeoutMs: 'DB_POOL_CONNECTION_TIMEOUT_MS',
    statementTimeoutMs: 'DB_STATEMENT_TIMEOUT_MS',
  },
  defaults: {
    /**
     * node-postgres defaults to 10, which the plan (§1.4) measured as the first
     * bottleneck: 2.450 active users cannot be served through 10 connections.
     * 40 is the plan's target per API instance behind PgBouncer.
     */
    max: 40,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 3_000,
    /**
     * No statement may hold a connection for minutes; anything slower than this
     * is a bug (or a report) and is cancelled with a visible error.
     */
    statementTimeoutMs: 5_000,
    /** Identifies the API in `pg_stat_activity.application_name`. */
    applicationName: 'ep-helpdesk-api',
    /** Worker jobs (SLA scan, retention) may legitimately run longer. */
    workerApplicationName: 'ep-helpdesk-worker',
    workerStatementTimeoutMs: 30_000,
  },
  /** Hard ceilings so a typo in env cannot exhaust the database. */
  limits: {
    minimumMax: 1,
    maximumMax: 200,
    minimumTimeoutMs: 100,
    maximumTimeoutMs: 600_000,
  },
} as const;
