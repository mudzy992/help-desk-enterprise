-- W7.13 / BA-assets-13: explicit apply ownership, lease recovery and durable
-- per-batch checkpoints. Existing PREVIEW rows are not rewritten: old claims
-- cannot be distinguished safely from expired previews because the legacy code
-- only changed expiresAt and did not persist a cursor or results.
BEGIN;

ALTER TYPE "AssetImportStatus" ADD VALUE 'APPLYING';

ALTER TABLE "AssetImportJob"
  ADD COLUMN "applyRunToken" UUID,
  ADD COLUMN "applyLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "applyProgress" JSONB,
  ADD COLUMN "applyAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AssetImportJob"
  ADD CONSTRAINT "AssetImportJob_apply_attempts_nonnegative_check"
    CHECK ("applyAttempts" >= 0),
  ADD CONSTRAINT "AssetImportJob_apply_lease_state_check"
    CHECK (
      (
        "status"::text = 'APPLYING'
        AND "applyRunToken" IS NOT NULL
        AND "applyLeaseUntil" IS NOT NULL
        AND "rows" IS NOT NULL
        AND "applyAttempts" > 0
      )
      OR (
        "status"::text <> 'APPLYING'
        AND "applyRunToken" IS NULL
        AND "applyLeaseUntil" IS NULL
        AND "applyProgress" IS NULL
      )
    );

COMMENT ON COLUMN "AssetImportJob"."applyProgress" IS
  'W7.13 checkpoint: planned-row cursor and cumulative apply counts/failures, committed atomically with each non-all-or-nothing batch.';

COMMIT;
