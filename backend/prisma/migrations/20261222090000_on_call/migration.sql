-- Paket 2.9 (K3): on-call schedules, rotation, overrides, swap requests,
-- iCal tokens, SLA escalation to the on-call agent, and the permissions.
-- Additive only.

CREATE TYPE "OnCallRotationLength" AS ENUM ('DAY', 'WEEK');
CREATE TYPE "OnCallSwapStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

CREATE TABLE "OnCallSchedule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "handoffMinute" INTEGER NOT NULL DEFAULT 480,
    "rotationLength" "OnCallRotationLength" NOT NULL DEFAULT 'WEEK',
    "rotationStartDate" VARCHAR(10) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoAssignOutsideHours" BOOLEAN NOT NULL DEFAULT false,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnCallSchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnCallSchedule_groupId_key" ON "OnCallSchedule"("groupId");
CREATE INDEX "OnCallSchedule_ownerUserId_idx" ON "OnCallSchedule"("ownerUserId");
ALTER TABLE "OnCallSchedule" ADD CONSTRAINT "OnCallSchedule_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnCallSchedule" ADD CONSTRAINT "OnCallSchedule_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OnCallRotationMember" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "OnCallRotationMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnCallRotationMember_scheduleId_userId_key" ON "OnCallRotationMember"("scheduleId", "userId");
CREATE UNIQUE INDEX "OnCallRotationMember_scheduleId_position_key" ON "OnCallRotationMember"("scheduleId", "position");
CREATE INDEX "OnCallRotationMember_userId_idx" ON "OnCallRotationMember"("userId");
ALTER TABLE "OnCallRotationMember" ADD CONSTRAINT "OnCallRotationMember_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "OnCallSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnCallRotationMember" ADD CONSTRAINT "OnCallRotationMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnCallOverride" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdById" TEXT,
    "swapRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnCallOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnCallOverride_swapRequestId_key" ON "OnCallOverride"("swapRequestId");
CREATE INDEX "OnCallOverride_scheduleId_startsAt_endsAt_idx" ON "OnCallOverride"("scheduleId", "startsAt", "endsAt");
CREATE INDEX "OnCallOverride_userId_idx" ON "OnCallOverride"("userId");
CREATE INDEX "OnCallOverride_endsAt_idx" ON "OnCallOverride"("endsAt");
ALTER TABLE "OnCallOverride" ADD CONSTRAINT "OnCallOverride_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "OnCallSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnCallOverride" ADD CONSTRAINT "OnCallOverride_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnCallSwapRequest" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "colleagueId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "OnCallSwapStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnCallSwapRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OnCallSwapRequest_scheduleId_status_idx" ON "OnCallSwapRequest"("scheduleId", "status");
CREATE INDEX "OnCallSwapRequest_colleagueId_status_idx" ON "OnCallSwapRequest"("colleagueId", "status");
CREATE INDEX "OnCallSwapRequest_requesterId_status_idx" ON "OnCallSwapRequest"("requesterId", "status");
CREATE INDEX "OnCallSwapRequest_endsAt_idx" ON "OnCallSwapRequest"("endsAt");
ALTER TABLE "OnCallSwapRequest" ADD CONSTRAINT "OnCallSwapRequest_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "OnCallSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnCallSwapRequest" ADD CONSTRAINT "OnCallSwapRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnCallSwapRequest" ADD CONSTRAINT "OnCallSwapRequest_colleagueId_fkey"
    FOREIGN KEY ("colleagueId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnCallCalendarToken" (
    "userId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnCallCalendarToken_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "OnCallCalendarToken_tokenHash_key" ON "OnCallCalendarToken"("tokenHash");
ALTER TABLE "OnCallCalendarToken" ADD CONSTRAINT "OnCallCalendarToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SlaEscalationRule" ADD COLUMN "targetOnCall" BOOLEAN NOT NULL DEFAULT false;

-- Permissions: oncall.read (AGENT, ADMIN), oncall.manage (ADMIN).
-- SUPER_ADMIN holds every permission implicitly.
INSERT INTO "Permission" ("id", "key", "description")
SELECT gen_random_uuid()::text, k.key, k.key
FROM (VALUES ('oncall.read'), ('oncall.manage')) AS k(key)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p
  ON (r."key" = 'AGENT' AND p."key" = 'oncall.read')
  OR (r."key" = 'ADMIN' AND p."key" IN ('oncall.read', 'oncall.manage'))
WHERE NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
);
