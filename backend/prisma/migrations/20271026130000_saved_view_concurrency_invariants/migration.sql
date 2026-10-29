-- W5.15: database backstop for the one-default-view-per-user invariant.
-- Preserve the newest default deterministically if legacy races left duplicates.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "userId" ORDER BY "updatedAt" DESC, "id" DESC) AS position
  FROM "SavedView" WHERE "isDefault" = true
)
UPDATE "SavedView" view SET "isDefault" = false
FROM ranked WHERE view."id" = ranked."id" AND ranked.position > 1;

CREATE UNIQUE INDEX "SavedView_one_default_per_user"
ON "SavedView" ("userId")
WHERE "isDefault" = true;
