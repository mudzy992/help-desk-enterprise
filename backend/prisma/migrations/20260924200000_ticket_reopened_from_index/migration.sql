-- Staging seed (2026-09-24): DELETE of 100k tickets ran for hours because the
-- self-referencing FK "reopenedFromTicketId" (ON DELETE SET NULL) had no index,
-- so every deleted row triggered a sequential scan of "Ticket".
-- IF NOT EXISTS: staging created the same index by hand before this migration.
CREATE INDEX IF NOT EXISTS "Ticket_reopenedFromTicketId_idx" ON "Ticket"("reopenedFromTicketId");
