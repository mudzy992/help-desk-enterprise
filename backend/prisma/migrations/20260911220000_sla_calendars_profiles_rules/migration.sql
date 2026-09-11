-- AlterTable BusinessHoursCalendar
ALTER TABLE "BusinessHoursCalendar" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable SlaProfile
ALTER TABLE "SlaProfile" ADD COLUMN "description" TEXT;
ALTER TABLE "SlaProfile" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "SlaProfile_calendarId_idx" ON "SlaProfile"("calendarId");
CREATE INDEX "SlaProfile_isActive_idx" ON "SlaProfile"("isActive");

-- AlterTable SlaRule
ALTER TABLE "SlaRule" ADD COLUMN "evaluationOrder" INTEGER NOT NULL DEFAULT 100;

CREATE INDEX "SlaRule_slaProfileId_evaluationOrder_idx" ON "SlaRule"("slaProfileId", "evaluationOrder");
