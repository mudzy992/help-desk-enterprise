-- Package 1.3: time tracking anti-abuse, manual entries and corrections (additive).
CREATE TYPE "TimeLogSource" AS ENUM ('TIMER', 'MANUAL');
CREATE TYPE "TimeLogStopReason" AS ENUM ('MANUAL', 'AUTO_IDLE', 'AUTO_MAX_DURATION', 'AUTO_TICKET_CLOSED', 'AUTO_SWITCHED');

ALTER TABLE "TicketTimeLog" ADD COLUMN "source" "TimeLogSource" NOT NULL DEFAULT 'TIMER';
ALTER TABLE "TicketTimeLog" ADD COLUMN "stopReason" "TimeLogStopReason";
ALTER TABLE "TicketTimeLog" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "TicketTimeLog" ADD COLUMN "note" TEXT;
ALTER TABLE "TicketTimeLog" ADD COLUMN "correctedAt" TIMESTAMP(3);
ALTER TABLE "TicketTimeLog" ADD COLUMN "correctedByUserId" TEXT;
ALTER TABLE "TicketTimeLog" ADD COLUMN "correctionReason" TEXT;
ALTER TABLE "TicketTimeLog" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "TicketTimeLog" ADD COLUMN "deletedByUserId" TEXT;
ALTER TABLE "TicketTimeLog" ADD COLUMN "deleteReason" TEXT;

-- Finished entries recorded before 1.3 were stopped by hand.
UPDATE "TicketTimeLog" SET "stopReason" = 'MANUAL' WHERE "endedAt" IS NOT NULL;

CREATE INDEX "TicketTimeLog_userId_endedAt_idx" ON "TicketTimeLog"("userId", "endedAt");
CREATE INDEX "TicketTimeLog_endedAt_startedAt_idx" ON "TicketTimeLog"("endedAt", "startedAt");
