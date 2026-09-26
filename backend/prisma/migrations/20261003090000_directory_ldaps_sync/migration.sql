-- Paket 1.8: LDAPS directory sync and Entra identity binding (additive).
ALTER TABLE "User" ADD COLUMN "directoryObjectGuid" TEXT;
ALTER TABLE "User" ADD COLUMN "directoryDeactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "directorySyncedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_directoryObjectGuid_key" ON "User"("directoryObjectGuid");

CREATE TYPE "DirectorySyncRunKind" AS ENUM ('TEST_CONNECTION', 'DRY_RUN', 'APPLY', 'SCHEDULED');
CREATE TYPE "DirectorySyncRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABORTED_SAFEGUARD');

CREATE TABLE "DirectorySyncRun" (
    "id" TEXT NOT NULL,
    "kind" "DirectorySyncRunKind" NOT NULL,
    "status" "DirectorySyncRunStatus" NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "actorUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "summary" JSONB,
    "plan" JSONB,
    "errorCode" VARCHAR(64),
    "appliedByRunId" TEXT,
    CONSTRAINT "DirectorySyncRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectorySyncRun_appliedByRunId_key" ON "DirectorySyncRun"("appliedByRunId");
CREATE INDEX "DirectorySyncRun_startedAt_idx" ON "DirectorySyncRun"("startedAt" DESC);
