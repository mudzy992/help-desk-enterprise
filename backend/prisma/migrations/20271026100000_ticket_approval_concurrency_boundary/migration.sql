-- W5.6: one canonical approval row per ticket workflow step.
-- Fail closed if legacy duplicates exist: choosing a winner automatically could
-- discard a real approval decision and requires an explicit operator repair.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "TicketApproval"
    GROUP BY "ticketId", "stepOrder"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'TICKET_APPROVAL_DUPLICATE_STEP_REPAIR_REQUIRED';
  END IF;
END $$;

CREATE UNIQUE INDEX "TicketApproval_ticketId_stepOrder_key"
  ON "TicketApproval"("ticketId", "stepOrder");
