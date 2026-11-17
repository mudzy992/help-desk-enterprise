-- W7.25 / BA-problems-07: durable target-reminder delivery.
--
-- Before this table the hourly sweep wrote the reminder stage into
-- `Problem.targetRemindersSent` *before* resolving a recipient and before any
-- delivery, with the comment "a crash after this skips one reminder instead of
-- repeating it forever": a crash, zero eligible recipients, a deactivated owner,
-- all preferences OFF, or a failed in-app/e-mail write lost the reminder for good.
--
-- One row per problem + target + stage is now written first and becomes terminal
-- (SENT / NO_RECIPIENT) only after the attempt finished; every other state is
-- retried with backoff until DEAD, and an operator can retry it again. The legacy
-- JSONB marker is appended only for the two terminal outcomes, so it means
-- "confirmed outcome" instead of "attempt started". The table starts empty: there
-- is nothing to backfill, and rows of earlier sweeps do not exist.
BEGIN;

CREATE TYPE "ProblemTargetReminderStatus" AS ENUM (
  'PENDING',
  'CLAIMED',
  'SENT',
  'NO_RECIPIENT',
  'FAILED',
  'DEAD',
  'CANCELLED'
);

CREATE TABLE "ProblemTargetReminder" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "targetAt" TIMESTAMP(3) NOT NULL,
    "stage" VARCHAR(16) NOT NULL,
    "status" "ProblemTargetReminderStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" VARCHAR(32),
    "claimedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemTargetReminder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProblemTargetReminder_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "ProblemTargetReminder_counters_check" CHECK (
      "deliveredCount" >= 0 AND "recipientCount" >= 0 AND "deliveredCount" <= "recipientCount"
    ),
    CONSTRAINT "ProblemTargetReminder_stage_check" CHECK ("stage" IN ('before', 'due', 'overdue'))
);

CREATE UNIQUE INDEX "ProblemTargetReminder_problemId_targetAt_stage_key"
  ON "ProblemTargetReminder"("problemId", "targetAt", "stage");
CREATE INDEX "ProblemTargetReminder_status_nextAttemptAt_idx"
  ON "ProblemTargetReminder"("status", "nextAttemptAt");
CREATE INDEX "ProblemTargetReminder_problemId_createdAt_idx"
  ON "ProblemTargetReminder"("problemId", "createdAt");

ALTER TABLE "ProblemTargetReminder"
  ADD CONSTRAINT "ProblemTargetReminder_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
