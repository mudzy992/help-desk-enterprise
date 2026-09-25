-- Review 2026-09-25 (S5): ticket numbers from a sequence instead of max + 1.
-- Standalone sequence (not owned by a column), so Prisma's schema diff ignores it.
CREATE SEQUENCE IF NOT EXISTS "ticket_number_seq" AS BIGINT START WITH 1 MINVALUE 1;

-- Continue after the highest existing `T-<digits>` number (prefix length 2).
SELECT setval(
  'ticket_number_seq',
  GREATEST(
    1,
    COALESCE(
      (SELECT MAX(substring("ticketNumber" FROM 3)::bigint)
         FROM "Ticket"
        WHERE "ticketNumber" LIKE 'T-%'
          AND substring("ticketNumber" FROM 3) ~ '^[0-9]+$'),
      0
    )
  ),
  EXISTS (SELECT 1 FROM "Ticket" WHERE "ticketNumber" LIKE 'T-%')
);
