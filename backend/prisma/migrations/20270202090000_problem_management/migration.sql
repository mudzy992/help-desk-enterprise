-- Paket 3.3: problem management (ITIL), behind private.addons.problems (off).

CREATE TYPE "ProblemStatus" AS ENUM ('NEW', 'INVESTIGATING', 'KNOWN_ERROR', 'RESOLVED', 'CLOSED', 'CANCELLED');

CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(8000) NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "impact" "TicketImpact" NOT NULL DEFAULT 'MEDIUM',
    "urgency" "TicketUrgency" NOT NULL DEFAULT 'MEDIUM',
    "ownerUserId" TEXT,
    "groupId" TEXT,
    "organizationalUnitId" TEXT NOT NULL,
    "serviceId" TEXT,
    "rootCauseCategory" VARCHAR(32),
    "rootCause" VARCHAR(8000),
    "rcaWhys" JSONB,
    "workaround" VARCHAR(8000),
    "workaroundAt" TIMESTAMP(3),
    "resolution" VARCHAR(8000),
    "knowledgeArticleId" TEXT,
    "targetAt" TIMESTAMP(3),
    "targetRemindersSent" JSONB NOT NULL DEFAULT '[]',
    "identifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" VARCHAR(1000),
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Problem_sequence_key" ON "Problem"("sequence");
CREATE INDEX "Problem_status_idx" ON "Problem"("status");
CREATE INDEX "Problem_ownerUserId_idx" ON "Problem"("ownerUserId");
CREATE INDEX "Problem_groupId_idx" ON "Problem"("groupId");
CREATE INDEX "Problem_organizationalUnitId_idx" ON "Problem"("organizationalUnitId");
CREATE INDEX "Problem_serviceId_idx" ON "Problem"("serviceId");
CREATE INDEX "Problem_createdAt_idx" ON "Problem"("createdAt");
CREATE INDEX "Problem_targetAt_idx" ON "Problem"("targetAt");
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_organizationalUnitId_fkey" FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_knowledgeArticleId_fkey" FOREIGN KEY ("knowledgeArticleId") REFERENCES "KnowledgeArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProblemTicket" (
    "problemId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProblemTicket_pkey" PRIMARY KEY ("problemId", "ticketId")
);
CREATE UNIQUE INDEX "ProblemTicket_ticketId_key" ON "ProblemTicket"("ticketId");
CREATE INDEX "ProblemTicket_problemId_linkedAt_idx" ON "ProblemTicket"("problemId", "linkedAt");
ALTER TABLE "ProblemTicket" ADD CONSTRAINT "ProblemTicket_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemTicket" ADD CONSTRAINT "ProblemTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProblemAsset" (
    "problemId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProblemAsset_pkey" PRIMARY KEY ("problemId", "assetId")
);
CREATE INDEX "ProblemAsset_assetId_idx" ON "ProblemAsset"("assetId");
ALTER TABLE "ProblemAsset" ADD CONSTRAINT "ProblemAsset_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemAsset" ADD CONSTRAINT "ProblemAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProblemService" (
    "problemId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    CONSTRAINT "ProblemService_pkey" PRIMARY KEY ("problemId", "serviceId")
);
CREATE INDEX "ProblemService_serviceId_idx" ON "ProblemService"("serviceId");
ALTER TABLE "ProblemService" ADD CONSTRAINT "ProblemService_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemService" ADD CONSTRAINT "ProblemService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProblemIncident" (
    "problemId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProblemIncident_pkey" PRIMARY KEY ("problemId", "incidentId")
);
CREATE INDEX "ProblemIncident_incidentId_idx" ON "ProblemIncident"("incidentId");
ALTER TABLE "ProblemIncident" ADD CONSTRAINT "ProblemIncident_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemIncident" ADD CONSTRAINT "ProblemIncident_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ServiceIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProblemEvent" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "actorUserId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProblemEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProblemEvent_problemId_createdAt_idx" ON "ProblemEvent"("problemId", "createdAt");
ALTER TABLE "ProblemEvent" ADD CONSTRAINT "ProblemEvent_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProblemSequence" (
    "id" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProblemSequence_pkey" PRIMARY KEY ("id")
);
INSERT INTO "ProblemSequence" ("id", "lastNumber") VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;

-- Permissions. Decision 2026-10-01: agents do everything (including close,
-- cancel and bulk resolve); problem.close stays separate so it can be revoked.
INSERT INTO "Permission" ("id", "key", "description")
SELECT gen_random_uuid()::text, k.key, k.key
FROM (VALUES ('problem.read'), ('problem.manage'), ('problem.close')) AS k(key)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON (
     r."key" IN ('AGENT', 'ADMIN') AND p."key" IN ('problem.read', 'problem.manage', 'problem.close')
)
WHERE NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
);
