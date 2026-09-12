-- AlterTable TicketSlaState
ALTER TABLE "TicketSlaState" ADD COLUMN "slaProfileId" TEXT;
ALTER TABLE "TicketSlaState" ADD COLUMN "slaRuleId" TEXT;
ALTER TABLE "TicketSlaState" ADD COLUMN "responseMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TicketSlaState" ADD COLUMN "resolutionMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TicketSlaState" ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TicketSlaState" ADD COLUMN "resolutionCompletedAt" TIMESTAMP(3);
ALTER TABLE "TicketSlaState" ADD COLUMN "pausedBusinessMinutes" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "TicketSlaState_pausedAt_idx" ON "TicketSlaState"("pausedAt");
CREATE INDEX "TicketSlaState_responseDueAt_idx" ON "TicketSlaState"("responseDueAt");
CREATE INDEX "TicketSlaState_resolutionDueAt_idx" ON "TicketSlaState"("resolutionDueAt");
