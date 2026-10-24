-- W2.5 approved repair policy (fail closed and deterministic):
-- 1. discard ambiguous rows that grant both OU and service scope;
-- 2. canonicalize every SUPER_ADMIN assignment to global scope;
-- 3. retain the lexicographically smallest id for each resulting identity.
DELETE FROM "UserRole"
WHERE "organizationalUnitId" IS NOT NULL
  AND "serviceId" IS NOT NULL;

UPDATE "UserRole" AS ur
SET "organizationalUnitId" = NULL,
    "serviceId" = NULL
FROM "Role" AS role
WHERE ur."roleId" = role."id"
  AND role."key" = 'SUPER_ADMIN'
  AND (ur."organizationalUnitId" IS NOT NULL OR ur."serviceId" IS NOT NULL);

DELETE FROM "UserRole" AS duplicate
USING "UserRole" AS retained
WHERE duplicate."id" > retained."id"
  AND duplicate."userId" = retained."userId"
  AND duplicate."roleId" = retained."roleId"
  AND duplicate."organizationalUnitId" IS NOT DISTINCT FROM retained."organizationalUnitId"
  AND duplicate."serviceId" IS NOT DISTINCT FROM retained."serviceId";

ALTER TABLE "UserRole"
  ADD CONSTRAINT "UserRole_single_scope_check"
  CHECK (NOT ("organizationalUnitId" IS NOT NULL AND "serviceId" IS NOT NULL));

CREATE UNIQUE INDEX "UserRole_global_identity_key"
  ON "UserRole" ("userId", "roleId")
  WHERE "organizationalUnitId" IS NULL AND "serviceId" IS NULL;

CREATE UNIQUE INDEX "UserRole_ou_identity_key"
  ON "UserRole" ("userId", "roleId", "organizationalUnitId")
  WHERE "organizationalUnitId" IS NOT NULL AND "serviceId" IS NULL;

CREATE UNIQUE INDEX "UserRole_service_identity_key"
  ON "UserRole" ("userId", "roleId", "serviceId")
  WHERE "organizationalUnitId" IS NULL AND "serviceId" IS NOT NULL;

-- Cross-table scope invariant: SUPER_ADMIN is always global. The application
-- repeats this validation for a useful API error; this trigger is the final DB guard.
CREATE OR REPLACE FUNCTION "enforce_global_super_admin_assignment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW."organizationalUnitId" IS NOT NULL OR NEW."serviceId" IS NOT NULL)
     AND EXISTS (
       SELECT 1 FROM "Role"
       WHERE "id" = NEW."roleId" AND "key" = 'SUPER_ADMIN'
     )
  THEN
    RAISE EXCEPTION 'SUPER_ADMIN assignments must be global'
      USING ERRCODE = '23514', CONSTRAINT = 'UserRole_super_admin_global_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "UserRole_super_admin_global_check"
BEFORE INSERT OR UPDATE OF "roleId", "organizationalUnitId", "serviceId"
ON "UserRole"
FOR EACH ROW EXECUTE FUNCTION "enforce_global_super_admin_assignment"();
