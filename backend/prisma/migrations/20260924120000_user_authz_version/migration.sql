-- Phase 2.2 (plan §2.2): version counter for the authorization cache.
--
-- The cached principal context lives under `authz:{userId}:v{authzVersion}`, so
-- incrementing this column makes every cached decision for that user
-- unreachable — including a Redis that was never told about the change (or one
-- that was restored from a snapshot). Deactivation therefore takes effect on the
-- very next request instead of after the 60 second TTL.
--
-- The column is added with a default, which in PostgreSQL 11+ is a metadata-only
-- change: no table rewrite, no long lock.
--
-- Rollback: ALTER TABLE "User" DROP COLUMN "authzVersion";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "authzVersion" INTEGER NOT NULL DEFAULT 0;
