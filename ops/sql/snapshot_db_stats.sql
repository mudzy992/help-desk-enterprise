-- Phase 0: database snapshot taken before and after every load test.
--
--   psql "$DATABASE_URL" -f ops/sql/snapshot_db_stats.sql > perf/results/<label>.db-before.txt
--   k6 run perf/full.js
--   psql "$DATABASE_URL" -f ops/sql/snapshot_db_stats.sql > perf/results/<label>.db-after.txt
--
-- The plan (§7) reads DB QPS, connection pressure and the slowest statements
-- from here; k6 only sees latency.

\pset pager off
\echo '=== snapshot taken at ==='
SELECT now() AS taken_at;

\echo '=== connections ==='
SELECT
  count(*) AS connections,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting_on_lock,
  count(*) FILTER (WHERE wait_event_type = 'Client') AS waiting_on_client
FROM pg_stat_activity;

\echo '=== connections by state and wait event ==='
SELECT
  state,
  coalesce(wait_event_type, '-') AS wait_event_type,
  coalesce(wait_event, '-') AS wait_event,
  count(*) AS connections
FROM pg_stat_activity
GROUP BY 1, 2, 3
ORDER BY connections DESC
LIMIT 20;

\echo '=== database throughput (xact/s, blks) ==='
SELECT
  datname,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  round(100 * blks_hit::numeric / nullif(blks_hit + blks_read, 0), 2) AS cache_hit_pct,
  tup_fetched,
  tup_returned
FROM pg_stat_database
WHERE datname = current_database();

\echo '=== top 20 by total execution time ==='
SELECT
  round(total_exec_time::numeric) AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  rows,
  left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

\echo '=== top 20 by call count ==='
SELECT
  calls,
  round(total_exec_time::numeric) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;

\echo '=== top 20 by mean execution time (calls > 100) ==='
SELECT
  round(mean_exec_time::numeric, 2) AS mean_ms,
  calls,
  round(total_exec_time::numeric) AS total_ms,
  left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS query
FROM pg_stat_statements
WHERE calls > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

\echo '=== statements hitting the ticket tables without a limit ==='
SELECT
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS query
FROM pg_stat_statements
WHERE query ILIKE '%from "tickets"%'
  AND query NOT ILIKE '%limit%'
  AND calls > 10
ORDER BY total_exec_time DESC
LIMIT 20;
