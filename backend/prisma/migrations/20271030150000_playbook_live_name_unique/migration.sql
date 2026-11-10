-- BA-templates-07: make live playbook names case-insensitively unique,
-- independent of activation state; soft-deleted names remain reusable.
-- Freeze writers across the duplicate preflight and index creation. Do not
-- choose or delete an arbitrary legacy duplicate: stop for explicit repair.
BEGIN;
LOCK TABLE "Playbook" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Playbook"
    WHERE "deletedAt" IS NULL
    GROUP BY lower("name")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'BA-templates-07: case-insensitive duplicate live Playbook names exist; reconcile them before creating the unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX "playbook_live_name_lower_key"
  ON "Playbook" (lower("name"))
  WHERE "deletedAt" IS NULL;

COMMIT;
