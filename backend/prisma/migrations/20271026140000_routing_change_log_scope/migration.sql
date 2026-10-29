ALTER TABLE "ChangeLog"
  ADD COLUMN "scopeOriginUnitId" TEXT,
  ADD COLUMN "scopeServiceId" TEXT;

-- Existing routing snapshots already carry immutable scope in both before and
-- after payloads. Backfill it before readers switch to the indexed columns.
UPDATE "ChangeLog"
SET
  "scopeOriginUnitId" = COALESCE(
    "diff" -> 'before' ->> 'originUnitId',
    "diff" -> 'after' ->> 'originUnitId'
  ),
  "scopeServiceId" = COALESCE(
    "diff" -> 'before' ->> 'serviceId',
    "diff" -> 'after' ->> 'serviceId'
  )
WHERE "entityType" = 'routing_rule';

CREATE INDEX "ChangeLog_routing_scope_page_idx"
  ON "ChangeLog"(
    "entityType",
    "scopeServiceId",
    "scopeOriginUnitId",
    "createdAt",
    "id"
  );
