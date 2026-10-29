-- W7.5 / BA-assets-05: normalize active unique custom asset attribute values.
-- PostgreSQL lower() is the canonicalizer, matching the existing uniqueness
-- semantics while the unique index is the final write/concurrency boundary.
-- Keep preflight, backfill and trigger installation atomic; no asset/catalog
-- writer may pass between the initial snapshot and trigger activation.
BEGIN;
LOCK TABLE "Asset", "AssetAttribute", "AssetType" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  duplicate_value RECORD;
BEGIN
  SELECT
    attribute."id" AS "attributeId",
    attribute."key" AS "attributeKey",
    lower(asset."attributes"->>attribute."key") AS "canonicalValue"
  INTO duplicate_value
  FROM "AssetAttribute" AS attribute
  JOIN "Asset" AS asset ON asset."typeId" = attribute."typeId"
  WHERE attribute."isUnique" = TRUE
    AND attribute."archivedAt" IS NULL
    AND asset."attributes" ? attribute."key"
    AND asset."attributes"->>attribute."key" IS NOT NULL
  GROUP BY attribute."id", attribute."key", lower(asset."attributes"->>attribute."key")
  HAVING count(*) > 1
  ORDER BY attribute."id", lower(asset."attributes"->>attribute."key")
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'cannot install unique asset attribute values: duplicate canonical value for attribute % (%)',
      duplicate_value."attributeKey",
      duplicate_value."canonicalValue";
  END IF;
END $$;

-- These composite keys let the normalized table prove that an attribute value
-- always belongs to an asset and definition of the same asset type.
CREATE UNIQUE INDEX "Asset_id_typeId_key" ON "Asset"("id", "typeId");
CREATE UNIQUE INDEX "AssetAttribute_id_typeId_key" ON "AssetAttribute"("id", "typeId");

CREATE TABLE "AssetUniqueAttributeValue" (
  "assetId" TEXT NOT NULL,
  "assetTypeId" TEXT NOT NULL,
  "attributeId" TEXT NOT NULL,
  "attributeTypeId" TEXT NOT NULL,
  "canonicalValue" TEXT NOT NULL,
  CONSTRAINT "AssetUniqueAttributeValue_pkey" PRIMARY KEY ("assetId", "attributeId"),
  CONSTRAINT "AssetUniqueAttributeValue_assetId_assetTypeId_fkey"
    FOREIGN KEY ("assetId", "assetTypeId") REFERENCES "Asset"("id", "typeId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetUniqueAttributeValue_attributeId_attributeTypeId_fkey"
    FOREIGN KEY ("attributeId", "attributeTypeId") REFERENCES "AssetAttribute"("id", "typeId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetUniqueAttributeValue_typeIds_check"
    CHECK ("assetTypeId" = "attributeTypeId")
);

CREATE UNIQUE INDEX "AssetUniqueAttributeValue_attributeId_canonicalValue_key"
  ON "AssetUniqueAttributeValue"("attributeId", "canonicalValue");
CREATE INDEX "AssetUniqueAttributeValue_assetTypeId_attributeId_idx"
  ON "AssetUniqueAttributeValue"("assetTypeId", "attributeId");

-- Backfill is fail-closed: the duplicate preflight above is repeated by the
-- unique index during insert if the data changed between inspection and DDL.
INSERT INTO "AssetUniqueAttributeValue" ("assetId", "assetTypeId", "attributeId", "attributeTypeId", "canonicalValue")
SELECT
  asset."id",
  asset."typeId",
  attribute."id",
  attribute."typeId",
  lower(asset."attributes"->>attribute."key")
FROM "AssetAttribute" AS attribute
JOIN "Asset" AS asset ON asset."typeId" = attribute."typeId"
WHERE attribute."isUnique" = TRUE
  AND attribute."archivedAt" IS NULL
  AND asset."attributes" ? attribute."key"
  AND asset."attributes"->>attribute."key" IS NOT NULL;

-- Attribute-bearing asset writes share a per-type advisory lock and lock all
-- definitions in stable order. Catalog updates take the conflicting row lock;
-- definition inserts take the exclusive advisory lock before the FK check.
CREATE FUNCTION "sync_asset_unique_attribute_values_from_asset"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  attribute_definition RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(NEW."typeId", 74293751));

  DELETE FROM "AssetUniqueAttributeValue"
  WHERE "assetId" = NEW."id";

  FOR attribute_definition IN
    SELECT "id", "key", "isUnique", "archivedAt"
    FROM "AssetAttribute"
    WHERE "typeId" = NEW."typeId"
    ORDER BY "id"
    FOR SHARE
  LOOP
    IF attribute_definition."isUnique" = TRUE
      AND attribute_definition."archivedAt" IS NULL
      AND NEW."attributes" ? attribute_definition."key"
      AND NEW."attributes"->>attribute_definition."key" IS NOT NULL
    THEN
      INSERT INTO "AssetUniqueAttributeValue" (
        "assetId", "assetTypeId", "attributeId", "attributeTypeId", "canonicalValue"
      ) VALUES (
        NEW."id",
        NEW."typeId",
        attribute_definition."id",
        NEW."typeId",
        lower(NEW."attributes"->>attribute_definition."key")
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "lock_asset_attribute_type_scope"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Lock before the FK check. A type-scoped advisory lock avoids lock-upgrade
  -- cycles with concurrent asset inserts that already hold FK KEY SHARE locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."typeId", 74293751));
  RETURN NEW;
END;
$$;

CREATE FUNCTION "sync_asset_unique_attribute_values_from_definition"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- INSERT already owns the type-scoped exclusive advisory lock from the
  -- BEFORE trigger. UPDATE is serialized by the definition row's own lock.
  DELETE FROM "AssetUniqueAttributeValue"
  WHERE "attributeId" = NEW."id";

  IF NEW."isUnique" = TRUE AND NEW."archivedAt" IS NULL THEN
    INSERT INTO "AssetUniqueAttributeValue" (
      "assetId", "assetTypeId", "attributeId", "attributeTypeId", "canonicalValue"
    )
    SELECT
      asset."id",
      asset."typeId",
      NEW."id",
      NEW."typeId",
      lower(asset."attributes"->>NEW."key")
    FROM "Asset" AS asset
    WHERE asset."typeId" = NEW."typeId"
      AND asset."attributes" ? NEW."key"
      AND asset."attributes"->>NEW."key" IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Asset_unique_attribute_values_sync"
AFTER INSERT OR UPDATE OF "attributes", "typeId" ON "Asset"
FOR EACH ROW EXECUTE FUNCTION "sync_asset_unique_attribute_values_from_asset"();

CREATE TRIGGER "AssetAttribute_unique_attribute_type_scope_lock"
BEFORE INSERT ON "AssetAttribute"
FOR EACH ROW EXECUTE FUNCTION "lock_asset_attribute_type_scope"();

CREATE TRIGGER "AssetAttribute_unique_attribute_values_sync"
AFTER INSERT OR UPDATE OF "isUnique", "archivedAt", "key", "typeId" ON "AssetAttribute"
FOR EACH ROW EXECUTE FUNCTION "sync_asset_unique_attribute_values_from_definition"();

COMMIT;
