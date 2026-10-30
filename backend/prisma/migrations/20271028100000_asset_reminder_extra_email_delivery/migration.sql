-- W7.11 / BA-assets-11: durable per-recipient claim and delivery status for
-- extra asset-reminder addresses. Only a hash of the normalized recipient and
-- a content fingerprint are stored; configured addresses and message payloads
-- remain outside this table. The additive table starts empty, so no backfill or
-- legacy-data preflight is required.
BEGIN;

-- The globally managed recipient list is classified as a secret by W7.11;
-- preserve its value while aligning the existing setting-row metadata.
UPDATE "AppSetting"
SET "scope" = 'PRIVATE', "isSecret" = TRUE
WHERE "key" = 'private.assets.reminders.recipients';

CREATE TABLE "AssetReminderEmailDelivery" (
    "id" TEXT NOT NULL,
    "recipientHash" CHAR(64) NOT NULL,
    "dedupeKey" VARCHAR(96) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "claimToken" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetReminderEmailDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetReminderEmailDelivery_status_check"
      CHECK ("status" IN ('CLAIMED', 'SENT', 'FAILED')),
    CONSTRAINT "AssetReminderEmailDelivery_attempts_check"
      CHECK ("attempts" > 0),
    CONSTRAINT "AssetReminderEmailDelivery_claim_state_check"
      CHECK (
        ("status" = 'CLAIMED' AND "claimToken" IS NOT NULL)
        OR ("status" IN ('SENT', 'FAILED') AND "claimToken" IS NULL)
      )
);

CREATE UNIQUE INDEX "AssetReminderEmailDelivery_recipientHash_dedupeKey_key"
  ON "AssetReminderEmailDelivery"("recipientHash", "dedupeKey");

CREATE INDEX "AssetReminderEmailDelivery_status_updatedAt_idx"
  ON "AssetReminderEmailDelivery"("status", "updatedAt");

COMMIT;
