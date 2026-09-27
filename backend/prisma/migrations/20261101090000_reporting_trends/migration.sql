-- Paket 2.5: reporting trends (indexes) and scheduled reports.

-- Trend indexes (design §4.2). Plain CREATE INDEX: Prisma runs the migration
-- in a transaction; on ~100k tickets each takes a few seconds.
CREATE INDEX IF NOT EXISTS "Ticket_originUnitId_resolvedAt_idx" ON "Ticket"("originUnitId", "resolvedAt");
CREATE INDEX IF NOT EXISTS "TicketSlaState_respondedAt_idx" ON "TicketSlaState"("respondedAt");
CREATE INDEX IF NOT EXISTS "TicketCsat_createdAt_idx" ON "TicketCsat"("createdAt");

-- Scheduled reports (design §5.3).
CREATE TYPE "ReportScheduleFrequency" AS ENUM ('WEEKLY', 'MONTHLY');
CREATE TYPE "ReportRunStatus" AS ENUM ('RUNNING', 'SENT', 'PARTIAL', 'SKIPPED', 'FAILED');
CREATE TYPE "ReportRunTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "frequency" "ReportScheduleFrequency" NOT NULL,
    "sendTime" VARCHAR(5) NOT NULL,
    "organizationalUnitId" TEXT NOT NULL,
    "serviceId" TEXT,
    "groupId" TEXT,
    "priority" "TicketPriority",
    "sections" TEXT[],
    "packKeys" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportScheduleRecipient" (
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportScheduleRecipient_pkey" PRIMARY KEY ("scheduleId", "userId")
);

CREATE TABLE "ReportScheduleRun" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "trigger" "ReportRunTrigger" NOT NULL,
    "slotKey" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ReportRunStatus" NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skipped" JSONB NOT NULL DEFAULT '[]',
    "omittedAttachments" JSONB NOT NULL DEFAULT '[]',
    "errorCode" VARCHAR(64),
    "durationMs" INTEGER,
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ReportScheduleRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportSchedule_enabled_nextRunAt_idx" ON "ReportSchedule"("enabled", "nextRunAt");
CREATE INDEX "ReportSchedule_organizationalUnitId_idx" ON "ReportSchedule"("organizationalUnitId");
CREATE INDEX "ReportScheduleRecipient_userId_idx" ON "ReportScheduleRecipient"("userId");
CREATE UNIQUE INDEX "ReportScheduleRun_slotKey_key" ON "ReportScheduleRun"("slotKey");
CREATE INDEX "ReportScheduleRun_scheduleId_createdAt_idx" ON "ReportScheduleRun"("scheduleId", "createdAt" DESC);
CREATE INDEX "ReportScheduleRun_createdAt_idx" ON "ReportScheduleRun"("createdAt");

ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_organizationalUnitId_fkey" FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportScheduleRecipient" ADD CONSTRAINT "ReportScheduleRecipient_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ReportSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportScheduleRecipient" ADD CONSTRAINT "ReportScheduleRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportScheduleRun" ADD CONSTRAINT "ReportScheduleRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ReportSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permission reports.schedule.manage (additive, idempotent) for ADMIN;
-- SUPER_ADMIN holds every permission implicitly.
INSERT INTO "Permission" ("id", "key", "description")
VALUES (gen_random_uuid()::text, 'reports.schedule.manage', 'reports.schedule.manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON p."key" = 'reports.schedule.manage'
WHERE r."key" IN ('ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
  );

UPDATE "User" SET "authzVersion" = "authzVersion" + 1
WHERE "id" IN (
  SELECT ur."userId" FROM "UserRole" ur
  INNER JOIN "Role" r ON r."id" = ur."roleId"
  WHERE r."key" IN ('ADMIN')
);
