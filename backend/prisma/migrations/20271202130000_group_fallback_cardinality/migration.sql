-- W2.13 (`BA-groups-03`): `Group.isFallback` had no cardinality invariant. Two
-- concurrent writes could each read "no fallback yet" and both set one, and no
-- constraint stopped a unit from carrying several fallback groups - while the
-- seed, the admin UI and the unrouted-ticket target all assume exactly one.
--
-- First repair existing data: keep the oldest fallback group of every unit (the
-- one the install seed would have picked, because it orders by key/creation) and
-- release the rest. The update is deterministic, so re-running it on a repaired
-- database is a no-op.
UPDATE "Group" AS "g"
SET "isFallback" = false
WHERE "g"."isFallback" = true
  AND "g"."id" <> (
    SELECT "keeper"."id"
    FROM "Group" AS "keeper"
    WHERE "keeper"."organizationalUnitId" = "g"."organizationalUnitId"
      AND "keeper"."isFallback" = true
    ORDER BY "keeper"."createdAt" ASC, "keeper"."id" ASC
    LIMIT 1
  );

-- Then make "at most one" a database fact, not a convention. A partial unique
-- index is used instead of a nullable-key trick so that non-fallback groups are
-- not constrained at all (a unit may have zero fallback groups).
CREATE UNIQUE INDEX "Group_fallback_per_organizational_unit_key"
  ON "Group" ("organizationalUnitId")
  WHERE "isFallback" = true;
