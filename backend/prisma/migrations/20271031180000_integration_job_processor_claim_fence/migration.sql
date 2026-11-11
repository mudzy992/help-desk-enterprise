-- Add durable compare-and-swap fencing for IntegrationJob processors.
-- Lease expiry is recorded here; stale PROCESSING recovery is a separate finding.
ALTER TABLE "IntegrationJob"
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "processingAttemptId" TEXT,
    ADD COLUMN "processingOwnerToken" TEXT,
    ADD COLUMN "processingLeaseExpiresAt" TIMESTAMP(3);
