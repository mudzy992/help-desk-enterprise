-- Phase 1.2 (plan §1.2): trigram indexes behind the server-side search.
--
-- `GET /search` matches with `ILIKE '%needle%'` (Prisma `contains`), and so does
-- the ticket list search box. A leading wildcard cannot use a B-tree, so the
-- three text columns that are searched get a GIN index with `gin_trgm_ops`
-- instead. The extension is created here, in the same script, because it is the
-- only place that can guarantee it exists before the indexes are built.
--
-- CONCURRENTLY keeps writes flowing while the indexes are built (Prisma Migrate
-- runs this script outside a transaction, see the phase 1.1 migration).
--
-- Rollback:
--   DROP INDEX CONCURRENTLY "Ticket_title_trgm_idx";
--   DROP INDEX CONCURRENTLY "Ticket_ticketNumber_trgm_idx";
--   DROP INDEX CONCURRENTLY "KnowledgeArticle_title_trgm_idx";
--   DROP EXTENSION IF EXISTS pg_trgm;  -- only if nothing else uses it

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX CONCURRENTLY "Ticket_title_trgm_idx" ON "Ticket" USING gin ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX CONCURRENTLY "Ticket_ticketNumber_trgm_idx" ON "Ticket" USING gin ("ticketNumber" gin_trgm_ops);

-- CreateIndex
CREATE INDEX CONCURRENTLY "KnowledgeArticle_title_trgm_idx" ON "KnowledgeArticle" USING gin ("title" gin_trgm_ops);
