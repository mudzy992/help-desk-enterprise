-- Phase 1.1 (plan §1.1): composite indexes behind the ticket list reads.
--
-- Every list read narrows by one of these columns and orders by "createdAt"
-- DESC with LIMIT 25/50. The table only had single-column indexes and no index
-- on "createdAt" at all, so the default page had to scan and sort the visible
-- set before it could return the first row.
--
-- CONCURRENTLY keeps writes flowing while the index is built. Prisma Migrate
-- runs migration scripts that contain CREATE INDEX CONCURRENTLY outside a
-- transaction (supported since Prisma 7.4; this repository pins 7.10), so the
-- statements can live here instead of a manual ops step.
--
-- Rollback: DROP INDEX CONCURRENTLY "<name>"; (see the report of phase 1).

-- CreateIndex
CREATE INDEX CONCURRENTLY "Ticket_createdAt_idx" ON "Ticket"("createdAt" DESC);

-- CreateIndex
CREATE INDEX CONCURRENTLY "Ticket_status_createdAt_idx" ON "Ticket"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX CONCURRENTLY "Ticket_assignedUserId_createdAt_idx" ON "Ticket"("assignedUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX CONCURRENTLY "Ticket_assignedGroupId_createdAt_idx" ON "Ticket"("assignedGroupId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX CONCURRENTLY "Ticket_requesterId_createdAt_idx" ON "Ticket"("requesterId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX CONCURRENTLY "Ticket_originUnitId_createdAt_idx" ON "Ticket"("originUnitId", "createdAt" DESC);
