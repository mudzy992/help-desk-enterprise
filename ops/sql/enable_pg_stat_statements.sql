-- Phase 0: make the database measurable.
--
-- Run once per database, as a superuser:
--   psql "$DATABASE_URL" -f ops/sql/enable_pg_stat_statements.sql
--
-- pg_stat_statements must be preloaded, which needs a restart. If the extension
-- cannot be created, set it in the server configuration first:
--
--   shared_preload_libraries = 'pg_stat_statements'
--   pg_stat_statements.track = all
--   pg_stat_statements.max = 5000
--
-- Coolify: Database → Advanced → Configuration, then restart the database
-- container. Managed Postgres usually exposes the same setting in its UI.

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Resets counters so a baseline run starts from zero. Do this BEFORE the test,
-- never during it.
SELECT pg_stat_statements_reset();

-- Confirmation: this must return a row with a non-null query.
SELECT
  calls,
  total_exec_time,
  mean_exec_time,
  rows,
  left(query, 60) AS query_prefix
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 3;
