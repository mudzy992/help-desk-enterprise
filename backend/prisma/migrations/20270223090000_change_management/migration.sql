-- Paket 3.4: change management (ITIL), behind private.addons.changes (off).
-- The module is active only with the addon on and at least one CAB group.

CREATE TYPE "ChangeType" AS ENUM ('STANDARD', 'NORMAL', 'EMERGENCY');
CREATE TYPE "ChangeStatus" AS ENUM ('DRAFT', 'ASSESSMENT', 'AUTHORIZATION', 'SCHEDULED', 'IMPLEMENTING', 'REVIEW', 'CLOSED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ChangeLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ChangeRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ChangeOutcome" AS ENUM ('SUCCESSFUL', 'PARTIAL', 'FAILED', 'ROLLED_BACK');

ALTER TABLE "Group" ADD COLUMN "isCabGroup" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ChangeTemplate" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "implementationPlan" VARCHAR(8000) NOT NULL,
    "backoutPlan" VARCHAR(8000) NOT NULL,
    "testPlan" VARCHAR(8000),
    "impact" "ChangeLevel" NOT NULL DEFAULT 'LOW',
    "likelihood" "ChangeLevel" NOT NULL DEFAULT 'LOW',
    "causesDowntime" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChangeTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChangeTemplate_isActive_idx" ON "ChangeTemplate"("isActive");

CREATE TABLE "ChangeTemplateService" (
    "templateId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    CONSTRAINT "ChangeTemplateService_pkey" PRIMARY KEY ("templateId", "serviceId")
);
CREATE INDEX "ChangeTemplateService_serviceId_idx" ON "ChangeTemplateService"("serviceId");
ALTER TABLE "ChangeTemplateService" ADD CONSTRAINT "ChangeTemplateService_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChangeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeTemplateService" ADD CONSTRAINT "ChangeTemplateService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(8000) NOT NULL,
    "reason" VARCHAR(4000) NOT NULL,
    "type" "ChangeType" NOT NULL DEFAULT 'NORMAL',
    "status" "ChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "impact" "ChangeLevel" NOT NULL DEFAULT 'MEDIUM',
    "likelihood" "ChangeLevel" NOT NULL DEFAULT 'MEDIUM',
    "risk" "ChangeRisk" NOT NULL DEFAULT 'MEDIUM',
    "implementationPlan" VARCHAR(8000),
    "backoutPlan" VARCHAR(8000),
    "testPlan" VARCHAR(8000),
    "communicationPlan" VARCHAR(8000),
    "causesDowntime" BOOLEAN NOT NULL DEFAULT false,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "outcome" "ChangeOutcome",
    "reviewNotes" VARCHAR(8000),
    "cabGroupId" TEXT,
    "ownerUserId" TEXT,
    "requesterUserId" TEXT,
    "organizationalUnitId" TEXT NOT NULL,
    "templateId" TEXT,
    "problemId" TEXT,
    "approvalRound" INTEGER NOT NULL DEFAULT 1,
    "conflictsAcknowledgedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" VARCHAR(1000),
    "reminderSentAt" TIMESTAMP(3),
    "overdueNotifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChangeRequest_sequence_key" ON "ChangeRequest"("sequence");
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");
CREATE INDEX "ChangeRequest_type_idx" ON "ChangeRequest"("type");
CREATE INDEX "ChangeRequest_plannedStart_idx" ON "ChangeRequest"("plannedStart");
CREATE INDEX "ChangeRequest_plannedEnd_idx" ON "ChangeRequest"("plannedEnd");
CREATE INDEX "ChangeRequest_ownerUserId_idx" ON "ChangeRequest"("ownerUserId");
CREATE INDEX "ChangeRequest_requesterUserId_idx" ON "ChangeRequest"("requesterUserId");
CREATE INDEX "ChangeRequest_cabGroupId_idx" ON "ChangeRequest"("cabGroupId");
CREATE INDEX "ChangeRequest_organizationalUnitId_idx" ON "ChangeRequest"("organizationalUnitId");
CREATE INDEX "ChangeRequest_problemId_idx" ON "ChangeRequest"("problemId");
CREATE INDEX "ChangeRequest_createdAt_idx" ON "ChangeRequest"("createdAt");
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_cabGroupId_fkey" FOREIGN KEY ("cabGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_organizationalUnitId_fkey" FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChangeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChangeRequestService" (
    "changeId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    CONSTRAINT "ChangeRequestService_pkey" PRIMARY KEY ("changeId", "serviceId")
);
CREATE INDEX "ChangeRequestService_serviceId_idx" ON "ChangeRequestService"("serviceId");
ALTER TABLE "ChangeRequestService" ADD CONSTRAINT "ChangeRequestService_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeRequestService" ADD CONSTRAINT "ChangeRequestService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChangeRequestAsset" (
    "changeId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    CONSTRAINT "ChangeRequestAsset_pkey" PRIMARY KEY ("changeId", "assetId")
);
CREATE INDEX "ChangeRequestAsset_assetId_idx" ON "ChangeRequestAsset"("assetId");
ALTER TABLE "ChangeRequestAsset" ADD CONSTRAINT "ChangeRequestAsset_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeRequestAsset" ADD CONSTRAINT "ChangeRequestAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChangeApproval" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "approverUserId" TEXT,
    "decision" "ApprovalStatus" NOT NULL,
    "comment" VARCHAR(2000),
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChangeApproval_changeId_round_approverUserId_key" ON "ChangeApproval"("changeId", "round", "approverUserId");
CREATE INDEX "ChangeApproval_changeId_round_idx" ON "ChangeApproval"("changeId", "round");
CREATE INDEX "ChangeApproval_approverUserId_idx" ON "ChangeApproval"("approverUserId");
ALTER TABLE "ChangeApproval" ADD CONSTRAINT "ChangeApproval_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeApproval" ADD CONSTRAINT "ChangeApproval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChangeEvent" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "actorUserId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChangeEvent_changeId_createdAt_idx" ON "ChangeEvent"("changeId", "createdAt");
CREATE INDEX "ChangeEvent_actorUserId_idx" ON "ChangeEvent"("actorUserId");
ALTER TABLE "ChangeEvent" ADD CONSTRAINT "ChangeEvent_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChangeSequence" (
    "id" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ChangeSequence_pkey" PRIMARY KEY ("id")
);
INSERT INTO "ChangeSequence" ("id", "lastNumber") VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "ServiceDowntimeWindow" ADD COLUMN "changeRequestId" TEXT;
CREATE INDEX "ServiceDowntimeWindow_changeRequestId_idx" ON "ServiceDowntimeWindow"("changeRequestId");
ALTER TABLE "ServiceDowntimeWindow" ADD CONSTRAINT "ServiceDowntimeWindow_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Role and permissions (decision 2026-10-01).
INSERT INTO "Role" ("id", "key", "name", "isSystem", "updatedAt")
VALUES (gen_random_uuid()::text, 'CHANGE_MANAGER', 'ChangeManager', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission" ("id", "key", "description")
SELECT gen_random_uuid()::text, k.key, k.key
FROM (VALUES ('change.read'), ('change.request'), ('change.manage'), ('change.approve')) AS k(key)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON (
     (r."key" = 'AGENT' AND p."key" IN ('change.read', 'change.request'))
  OR (r."key" IN ('CHANGE_MANAGER', 'ADMIN') AND p."key" IN ('change.read', 'change.request', 'change.manage', 'change.approve'))
)
WHERE NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
);
