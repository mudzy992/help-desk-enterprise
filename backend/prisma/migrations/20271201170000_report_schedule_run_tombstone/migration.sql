-- W7.97 (`BA-reports-07`): deleting a schedule cascaded into its run log, so a schedule removed on day 2 took
-- its whole history with it instead of keeping it for the 180-day retention window. The run now records the
-- schedule name and organizational unit it belongs to and its `scheduleId` becomes nullable with
-- ON DELETE SET NULL: the schedule can go, the evidence stays until retention prunes it.
ALTER TABLE "ReportScheduleRun" ADD COLUMN "scheduleName" VARCHAR(120);
ALTER TABLE "ReportScheduleRun" ADD COLUMN "organizationalUnitId" TEXT;

-- Every surviving run still has its schedule (the cascade deleted the orphans), so the snapshot is complete.
UPDATE "ReportScheduleRun" AS run
SET "scheduleName" = schedule."name",
    "organizationalUnitId" = schedule."organizationalUnitId"
FROM "ReportSchedule" AS schedule
WHERE schedule."id" = run."scheduleId";

ALTER TABLE "ReportScheduleRun" ALTER COLUMN "scheduleName" SET NOT NULL;
ALTER TABLE "ReportScheduleRun" ALTER COLUMN "organizationalUnitId" SET NOT NULL;

ALTER TABLE "ReportScheduleRun" ALTER COLUMN "scheduleId" DROP NOT NULL;
ALTER TABLE "ReportScheduleRun" DROP CONSTRAINT "ReportScheduleRun_scheduleId_fkey";
ALTER TABLE "ReportScheduleRun" ADD CONSTRAINT "ReportScheduleRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ReportSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ReportScheduleRun_organizationalUnitId_createdAt_idx" ON "ReportScheduleRun"("organizationalUnitId", "createdAt");
