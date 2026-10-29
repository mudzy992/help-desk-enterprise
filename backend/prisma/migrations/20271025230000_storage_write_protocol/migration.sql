CREATE TYPE "StorageWriteStatus" AS ENUM ('PENDING_PROMOTION', 'PROCESSING', 'READY', 'FAILED', 'COMPENSATED');

CREATE TABLE "StorageWriteIntent" (
  "id" UUID NOT NULL,
  "namespace" VARCHAR(80) NOT NULL,
  "key" VARCHAR(160) NOT NULL,
  "stagingKey" VARCHAR(300) NOT NULL,
  "finalKey" VARCHAR(300) NOT NULL,
  "contentHash" CHAR(64) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "status" "StorageWriteStatus" NOT NULL DEFAULT 'PENDING_PROMOTION',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 10,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ownerToken" UUID,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" VARCHAR(1000),
  "readyAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageWriteIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorageWriteIntent_sizeBytes_check" CHECK ("sizeBytes" BETWEEN 0 AND 104857600),
  CONSTRAINT "StorageWriteIntent_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "StorageWriteIntent_maxAttempts_check" CHECK ("maxAttempts" BETWEEN 1 AND 100),
  CONSTRAINT "StorageWriteIntent_processing_lease_check" CHECK (
    ("status" = 'PROCESSING' AND "ownerToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    OR ("status" <> 'PROCESSING' AND "ownerToken" IS NULL AND "leaseExpiresAt" IS NULL)
  )
);
CREATE UNIQUE INDEX "StorageWriteIntent_stagingKey_key" ON "StorageWriteIntent"("stagingKey");
CREATE UNIQUE INDEX "StorageWriteIntent_finalKey_key" ON "StorageWriteIntent"("finalKey");
CREATE UNIQUE INDEX "StorageWriteIntent_namespace_key_key" ON "StorageWriteIntent"("namespace", "key");
CREATE INDEX "StorageWriteIntent_namespace_status_nextAttemptAt_createdAt_idx" ON "StorageWriteIntent"("namespace", "status", "nextAttemptAt", "createdAt");
CREATE INDEX "StorageWriteIntent_status_leaseExpiresAt_idx" ON "StorageWriteIntent"("status", "leaseExpiresAt");
