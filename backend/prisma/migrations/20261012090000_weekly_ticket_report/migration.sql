-- Paket 2.2a: weekly ticket report for agents.
ALTER TABLE "UserNotificationSchedule" ADD COLUMN "lastWeeklyReportAt" TIMESTAMP(3);

-- The weekly report is locked by default (decision W8). Installations that kept
-- the 2.2 default for locked e-mail categories get the new category appended;
-- an administrator's own list is left untouched.
UPDATE "AppSetting"
SET "value" = to_jsonb('ticket.approval,ticket.sla,report.weeklyTickets'::text), "updatedAt" = NOW()
WHERE "key" = 'private.notifications.lockedEmailTypesCsv'
  AND "value" = to_jsonb('ticket.approval,ticket.sla'::text);
