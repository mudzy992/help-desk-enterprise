-- W7.6 / BA-assets-06: make directed acyclicity and CONNECTED_TO symmetry
-- database invariants. Preflight, indexes and triggers are atomic; the table
-- lock prevents a writer from slipping between validation and installation.
BEGIN;
LOCK TABLE "AssetRelation" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  duplicate_pair RECORD;
BEGIN
  SELECT
    LEAST(relation."fromAssetId", relation."toAssetId") AS "firstAssetId",
    GREATEST(relation."fromAssetId", relation."toAssetId") AS "secondAssetId",
    count(*) AS "rowCount"
  INTO duplicate_pair
  FROM "AssetRelation" AS relation
  WHERE relation."kind" = 'CONNECTED_TO'
  GROUP BY
    LEAST(relation."fromAssetId", relation."toAssetId"),
    GREATEST(relation."fromAssetId", relation."toAssetId")
  HAVING count(*) > 1
  ORDER BY "firstAssetId", "secondAssetId"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'cannot install BA-assets-06 invariant: CONNECTED_TO rows duplicate canonical endpoint pair (%, %) (% rows)',
      duplicate_pair."firstAssetId",
      duplicate_pair."secondAssetId",
      duplicate_pair."rowCount";
  END IF;
END;
$$;

DO $$
DECLARE
  cycle_asset_id TEXT;
BEGIN
  WITH RECURSIVE directed_reach("startAssetId", "reachableAssetId") AS (
    SELECT relation."fromAssetId", relation."toAssetId"
    FROM "AssetRelation" AS relation
    WHERE relation."kind"::text IN ('DEPENDS_ON', 'RUNS_ON', 'PART_OF', 'INSTALLED_ON')

    UNION

    SELECT directed_reach."startAssetId", relation."toAssetId"
    FROM directed_reach
    JOIN "AssetRelation" AS relation
      ON relation."fromAssetId" = directed_reach."reachableAssetId"
    WHERE relation."kind"::text IN ('DEPENDS_ON', 'RUNS_ON', 'PART_OF', 'INSTALLED_ON')
  )
  SELECT directed_reach."startAssetId"
  INTO cycle_asset_id
  FROM directed_reach
  WHERE directed_reach."startAssetId" = directed_reach."reachableAssetId"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'cannot install BA-assets-06 invariant: directed relation cycle already exists at asset %; repair the graph and retry the migration',
      cycle_asset_id;
  END IF;
END;
$$;

-- A canonical unordered endpoint pair permits either stored orientation, but
-- exactly one CONNECTED_TO row for that pair. Keep the directional unique
-- index in place for the other relation kinds and duplicate API contract.
CREATE UNIQUE INDEX "AssetRelation_connected_to_canonical_key"
  ON "AssetRelation" (
    LEAST("fromAssetId", "toAssetId"),
    GREATEST("fromAssetId", "toAssetId")
  )
  WHERE "kind" = 'CONNECTED_TO';

-- Acquire one transaction-scoped graph-write lock before any INSERT/UPDATE
-- row locks or FK/index work. All writers then validate against a serialized
-- committed graph; deletes only remove edges and cannot create a cycle.
CREATE FUNCTION "lock_asset_relation_graph_writes"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(74293751, 6);
  RETURN NULL;
END;
$$;

CREATE TRIGGER "AssetRelation_graph_write_lock_insert"
BEFORE INSERT ON "AssetRelation"
FOR EACH STATEMENT
EXECUTE FUNCTION "lock_asset_relation_graph_writes"();

CREATE TRIGGER "AssetRelation_graph_write_lock_update"
BEFORE UPDATE ON "AssetRelation"
FOR EACH STATEMENT
EXECUTE FUNCTION "lock_asset_relation_graph_writes"();

-- Validate the graph after the whole statement so multi-row inserts/updates
-- are checked as one final graph. Each new directed edge is a reachability
-- seed; a cycle is present exactly when its source is reachable from its
-- destination. UNION deduplication bounds traversal even for malformed data.
CREATE FUNCTION "validate_asset_relation_acyclic_after_statement"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  creates_cycle BOOLEAN;
BEGIN
  WITH RECURSIVE new_directed_edges("fromAssetId", "toAssetId", "currentAssetId") AS (
    SELECT
      new_rows."fromAssetId",
      new_rows."toAssetId",
      new_rows."toAssetId"
    FROM new_relation_rows AS new_rows
    WHERE new_rows."kind"::text IN ('DEPENDS_ON', 'RUNS_ON', 'PART_OF', 'INSTALLED_ON')
  ), directed_reach("fromAssetId", "toAssetId", "currentAssetId") AS (
    SELECT
      new_directed_edges."fromAssetId",
      new_directed_edges."toAssetId",
      new_directed_edges."currentAssetId"
    FROM new_directed_edges

    UNION

    SELECT
      directed_reach."fromAssetId",
      directed_reach."toAssetId",
      relation."toAssetId"
    FROM directed_reach
    JOIN "AssetRelation" AS relation
      ON relation."fromAssetId" = directed_reach."currentAssetId"
    WHERE relation."kind"::text IN ('DEPENDS_ON', 'RUNS_ON', 'PART_OF', 'INSTALLED_ON')
  )
  SELECT EXISTS (
    SELECT 1
    FROM directed_reach
    WHERE directed_reach."currentAssetId" = directed_reach."fromAssetId"
  )
  INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION 'AssetRelation_directed_acyclic: directed asset relations must remain acyclic'
      USING ERRCODE = '23514',
            CONSTRAINT = 'AssetRelation_directed_acyclic',
            TABLE = 'AssetRelation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "AssetRelation_directed_acyclic_insert"
AFTER INSERT ON "AssetRelation"
REFERENCING NEW TABLE AS new_relation_rows
FOR EACH STATEMENT
EXECUTE FUNCTION "validate_asset_relation_acyclic_after_statement"();

CREATE TRIGGER "AssetRelation_directed_acyclic_update"
AFTER UPDATE ON "AssetRelation"
REFERENCING NEW TABLE AS new_relation_rows
FOR EACH STATEMENT
EXECUTE FUNCTION "validate_asset_relation_acyclic_after_statement"();

COMMIT;
