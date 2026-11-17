-- W7.24 / BA-problems-06: durable per-ticket group resolution.
--
-- A run is written before the problem status changes, so a crash or a failed
-- ticket write no longer loses the resolution silently. Every ticket carries
-- its own status, attempt counter and message flag; `POST .../resume` picks up
-- exactly the items that are not terminal yet. Both tables start empty, so no
-- backfill or legacy-data preflight is required.
BEGIN;

CREATE TYPE "ProblemResolutionRunStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
CREATE TYPE "ProblemResolutionRunItemStatus" AS ENUM ('PENDING', 'RUNNING', 'RESOLVED', 'MESSAGE_PENDING', 'SKIPPED', 'FAILED');

CREATE TABLE "ProblemResolutionRun" (
    "id" UUID NOT NULL,
    "problemId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "status" "ProblemResolutionRunStatus" NOT NULL DEFAULT 'PROCESSING',
    "number" VARCHAR(32),
    "message" VARCHAR(8000) NOT NULL,
    "closeCode" VARCHAR(64),
    "total" INTEGER NOT NULL,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "messageFailed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "responseBody" JSONB,
    "lastError" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProblemResolutionRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProblemResolutionRun_counters_check" CHECK (
      "total" >= 0 AND "resolved" >= 0 AND "messageFailed" >= 0
      AND "failed" >= 0 AND "skipped" >= 0
      AND "resolved" + "messageFailed" + "failed" + "skipped" <= "total"
    )
);

CREATE TABLE "ProblemResolutionRunItem" (
    "id" TEXT NOT NULL,
    "runId" UUID NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketNumber" VARCHAR(32) NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "status" "ProblemResolutionRunItemStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(32),
    "errorCode" VARCHAR(64),
    "retryable" BOOLEAN,
    "messageSent" BOOLEAN NOT NULL DEFAULT FALSE,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemResolutionRunItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProblemResolutionRunItem_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "ProblemResolutionRunItem_ordinal_check" CHECK ("ordinal" >= 0)
);

CREATE UNIQUE INDEX "ProblemResolutionRunItem_runId_ticketId_key"
  ON "ProblemResolutionRunItem"("runId", "ticketId");
CREATE UNIQUE INDEX "ProblemResolutionRunItem_runId_ordinal_key"
  ON "ProblemResolutionRunItem"("runId", "ordinal");
CREATE INDEX "ProblemResolutionRunItem_runId_status_idx"
  ON "ProblemResolutionRunItem"("runId", "status");
CREATE INDEX "ProblemResolutionRun_problemId_createdAt_idx"
  ON "ProblemResolutionRun"("problemId", "createdAt");
CREATE INDEX "ProblemResolutionRun_status_updatedAt_idx"
  ON "ProblemResolutionRun"("status", "updatedAt");

ALTER TABLE "ProblemResolutionRun"
  ADD CONSTRAINT "ProblemResolutionRun_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemResolutionRun"
  ADD CONSTRAINT "ProblemResolutionRun_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProblemResolutionRunItem"
  ADD CONSTRAINT "ProblemResolutionRunItem_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ProblemResolutionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
