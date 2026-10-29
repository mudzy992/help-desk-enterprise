-- Add retention timestamps for status-page incidents and their updates so the
-- nightly retention sweep can mark incidents as archived (tombstone) and
-- redact update messages without dropping the incident skeleton used by
-- reports and uptime history.
ALTER TABLE "ServiceIncident"
  ADD COLUMN "retentionArchivedAt" TIMESTAMP(3);

ALTER TABLE "ServiceIncidentUpdate"
  ADD COLUMN "contentRedactedAt" TIMESTAMP(3);

CREATE INDEX "ServiceIncident_retentionArchivedAt_idx" ON "ServiceIncident"("retentionArchivedAt");
CREATE INDEX "ServiceIncidentUpdate_contentRedactedAt_idx" ON "ServiceIncidentUpdate"("contentRedactedAt");

-- Backfill: incidents resolved before the retention cutoff that have never been
-- archived are now eligible; no rows are modified by the schema change itself.
