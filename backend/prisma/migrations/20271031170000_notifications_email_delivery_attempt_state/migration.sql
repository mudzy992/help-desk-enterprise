-- Extend the existing email-delivery ledger; do not rewrite its historical
-- migrations or alter the privacy-retention policy.
ALTER TABLE "NotificationEmailDelivery"
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
    ADD COLUMN "nextRetryAt" TIMESTAMP(3),
    ADD COLUMN "lastErrorCode" VARCHAR(32),
    ADD COLUMN "lastErrorResponseCode" INTEGER,
    ADD COLUMN "providerMessageId" VARCHAR(500),
    ADD COLUMN "providerResponseCode" INTEGER,
    ADD COLUMN "providerAcceptedAt" TIMESTAMP(3),
    ADD CONSTRAINT "NotificationEmailDelivery_attempts_check" CHECK ("attempts" >= 0);

CREATE INDEX "NotificationEmailDelivery_status_nextRetryAt_createdAt_idx"
    ON "NotificationEmailDelivery"("status", "nextRetryAt", "createdAt");
