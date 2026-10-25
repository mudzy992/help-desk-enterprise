CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'SUCCEEDED');

CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "namespace" VARCHAR(80) NOT NULL,
  "key" VARCHAR(128) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
  "ownerToken" UUID NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "responseStatus" INTEGER,
  "responseBody" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyRecord_namespace_key_key" ON "IdempotencyRecord"("namespace", "key");
CREATE INDEX "IdempotencyRecord_status_leaseExpiresAt_idx" ON "IdempotencyRecord"("status", "leaseExpiresAt");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
