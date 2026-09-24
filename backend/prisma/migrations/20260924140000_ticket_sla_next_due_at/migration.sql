-- Phase 2.1 (plan §2.1): the SLA scanner stops reading every open state.
--
-- A single scheduling column holds the earliest instant at which a state can
-- still change on its own (at-risk mark, breach, escalation). The scan is then
--   WHERE "resolutionCompletedAt" IS NULL AND "nextDueAt" <= now()
--   ORDER BY "nextDueAt" ASC LIMIT 2000
-- which is exactly what the composite index below serves.
--
-- Both statements are metadata-only / concurrent: adding a nullable column does
-- not rewrite the table, and CONCURRENTLY keeps writes flowing while the index
-- is built. Prisma Migrate runs scripts containing CREATE INDEX CONCURRENTLY
-- outside a transaction (supported since Prisma 7.4; this repository pins 7.10).
--
-- Rollback: DROP INDEX CONCURRENTLY "TicketSlaState_resolutionCompletedAt_nextDueAt_idx";
--           ALTER TABLE "TicketSlaState" DROP COLUMN "nextDueAt";

-- AlterTable
ALTER TABLE "TicketSlaState" ADD COLUMN "nextDueAt" TIMESTAMP(3);

-- Backfill: every row that exists today has "nextDueAt" NULL, and the scanner
-- only reads states that are due (`nextDueAt <= now()`), so without this the
-- whole open backlog would silently drop out of SLA processing.
--
-- `now()` is deliberate: it enqueues the open states for the next scan cycle,
-- and the cycle itself recomputes the exact value from the rules and the
-- business-hours calendar (a paused or disabled state goes back to NULL there).
-- The update runs before the index is built so that the new rows are indexed
-- once instead of twice.
UPDATE "TicketSlaState"
   SET "nextDueAt" = NOW()
 WHERE "resolutionCompletedAt" IS NULL
   AND "nextDueAt" IS NULL;

-- CreateIndex
CREATE INDEX CONCURRENTLY "TicketSlaState_resolutionCompletedAt_nextDueAt_idx" ON "TicketSlaState"("resolutionCompletedAt", "nextDueAt");
