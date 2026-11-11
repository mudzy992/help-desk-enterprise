-- BA-templates-10: retain the application ticket-row lock, and enforce the
-- one-active-checklist rule for every writer at the database boundary.
-- Freeze writes between preflight and index creation so a duplicate cannot
-- enter in the gap. Do not pick/delete an arbitrary duplicate: stop and require
-- an explicit operator cleanup before retrying this migration.
BEGIN;
LOCK TABLE "TicketPlaybook" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "TicketPlaybook"
    WHERE "detachedAt" IS NULL
    GROUP BY "ticketId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'BA-templates-10: duplicate active TicketPlaybook rows exist; reconcile them before creating the unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX "TicketPlaybook_one_active_per_ticket_key"
  ON "TicketPlaybook" ("ticketId")
  WHERE "detachedAt" IS NULL;
COMMIT;
