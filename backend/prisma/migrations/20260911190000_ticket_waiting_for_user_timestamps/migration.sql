-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "waitingForUserEnteredAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "waitingForUserReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Ticket_status_waitingForUserEnteredAt_idx" ON "Ticket"("status", "waitingForUserEnteredAt");
