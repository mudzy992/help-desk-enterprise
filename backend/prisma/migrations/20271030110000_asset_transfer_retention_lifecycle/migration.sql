-- W7.14 / BA-assets-14: define a privacy-retention redaction marker and a
-- durable, fail-closed queue marker for signed files. Existing transfers are
-- intentionally untouched; no legacy snapshot or signed binary is deleted by
-- this additive schema change.
BEGIN;

ALTER TABLE "AssetTransfer"
  ADD COLUMN "signedFilePurgeRequestedAt" TIMESTAMP(3),
  ADD COLUMN "retentionRedactedAt" TIMESTAMP(3);

CREATE INDEX "AssetTransfer_status_signedAt_idx"
  ON "AssetTransfer"("status", "signedAt");

CREATE INDEX "AssetTransfer_status_cancelledAt_idx"
  ON "AssetTransfer"("status", "cancelledAt");

CREATE INDEX "AssetTransfer_signedFilePurgeRequestedAt_idx"
  ON "AssetTransfer"("signedFilePurgeRequestedAt");

CREATE INDEX "AssetTransfer_retentionRedactedAt_idx"
  ON "AssetTransfer"("retentionRedactedAt");

COMMENT ON COLUMN "AssetTransfer"."signedFilePurgeRequestedAt" IS
  'W7.14 durable purge request; signed file reads are denied until storage deletion and path cleanup succeed.';

COMMENT ON COLUMN "AssetTransfer"."retentionRedactedAt" IS
  'W7.14 marks terminal transfer records whose personal snapshot fields were redacted by configured retention.';

COMMIT;
