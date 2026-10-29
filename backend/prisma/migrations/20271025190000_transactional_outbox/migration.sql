CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'DEAD_LETTER');

CREATE TABLE "OutboxMessage" (
  "id" UUID NOT NULL,
  "topic" VARCHAR(100) NOT NULL,
  "dedupeKey" VARCHAR(160) NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 10,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ownerToken" UUID,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" VARCHAR(1000),
  "completedAt" TIMESTAMP(3),
  "replayCount" INTEGER NOT NULL DEFAULT 0,
  "lastReplayedAt" TIMESTAMP(3),
  "lastReplayedBy" VARCHAR(128),
  "lastReplayReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboxMessage_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "OutboxMessage_maxAttempts_check" CHECK ("maxAttempts" BETWEEN 1 AND 100),
  CONSTRAINT "OutboxMessage_processing_lease_check" CHECK (
    ("status" = 'PROCESSING' AND "ownerToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    OR ("status" <> 'PROCESSING' AND "ownerToken" IS NULL AND "leaseExpiresAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "OutboxMessage_topic_dedupeKey_key" ON "OutboxMessage"("topic", "dedupeKey");
CREATE INDEX "OutboxMessage_status_nextAttemptAt_createdAt_idx" ON "OutboxMessage"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "OutboxMessage_status_leaseExpiresAt_idx" ON "OutboxMessage"("status", "leaseExpiresAt");
CREATE INDEX "OutboxMessage_expiresAt_idx" ON "OutboxMessage"("expiresAt");
