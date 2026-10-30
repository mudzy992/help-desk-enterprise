-- W7.15: block implicit business-link cascades and archive event history before
-- the AssetEvent -> Asset cascade removes rows attached to a hard-deleted asset.

CREATE TABLE "AssetEventArchive" (
  "id" TEXT NOT NULL,
  "originalAssetId" TEXT NOT NULL,
  "assetTagSnapshot" VARCHAR(64) NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "actorUserId" TEXT,
  "detail" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetEventArchive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetEventArchive_originalAssetId_createdAt_idx"
  ON "AssetEventArchive"("originalAssetId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION "asset_hard_delete_guard_and_archive"()
RETURNS TRIGGER AS $$
DECLARE
  blocked_dependencies TEXT;
BEGIN
  SELECT string_agg(dependency."kind" || ':' || dependency."count"::text, ',')
    INTO blocked_dependencies
  FROM (
    SELECT 'tickets'::text AS "kind", COUNT(*) AS "count"
      FROM "TicketAsset" WHERE "assetId" = OLD."id"
    UNION ALL
    SELECT 'relationsFrom'::text, COUNT(*)
      FROM "AssetRelation" WHERE "fromAssetId" = OLD."id"
    UNION ALL
    SELECT 'relationsTo'::text, COUNT(*)
      FROM "AssetRelation" WHERE "toAssetId" = OLD."id"
    UNION ALL
    SELECT 'transferItems'::text, COUNT(*)
      FROM "AssetTransferItem" WHERE "assetId" = OLD."id"
    UNION ALL
    SELECT 'contractItems'::text, COUNT(*)
      FROM "AssetContractItem" WHERE "assetId" = OLD."id"
    UNION ALL
    SELECT 'licenseAssignments'::text, COUNT(*)
      FROM "LicenseAssignment" WHERE "assetId" = OLD."id"
    UNION ALL
    SELECT 'problems'::text, COUNT(*)
      FROM "ProblemAsset" WHERE "assetId" = OLD."id"
    UNION ALL
    SELECT 'changes'::text, COUNT(*)
      FROM "ChangeRequestAsset" WHERE "assetId" = OLD."id"
  ) AS dependency
  WHERE dependency."count" > 0;

  IF blocked_dependencies IS NOT NULL THEN
    RAISE EXCEPTION 'ASSET_HAS_DEPENDENTS: %', blocked_dependencies
      USING ERRCODE = '23503', CONSTRAINT = 'Asset_hard_delete_dependencies';
  END IF;

  INSERT INTO "AssetEventArchive" (
    "id", "originalAssetId", "assetTagSnapshot", "action", "actorUserId", "detail", "createdAt"
  )
  SELECT
    event."id",
    OLD."id",
    OLD."assetTag",
    event."action",
    event."actorUserId",
    event."detail",
    event."createdAt"
  FROM "AssetEvent" AS event
  WHERE event."assetId" = OLD."id";

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Asset_hard_delete_guard_and_archive"
BEFORE DELETE ON "Asset"
FOR EACH ROW
EXECUTE FUNCTION "asset_hard_delete_guard_and_archive"();
