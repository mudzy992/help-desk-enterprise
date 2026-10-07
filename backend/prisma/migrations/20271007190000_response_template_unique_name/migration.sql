-- Package 5.2.4 (M13 B3): enforce case-insensitive template name uniqueness at
-- the database level. Two partial indexes are required:
--   * shared templates (ownerUserId IS NULL, deletedAt IS NULL) on lower(name);
--   * per-user templates (ownerUserId IS NOT NULL, deletedAt IS NULL) on
--     (lower(name), ownerUserId).
-- Soft-deleted rows do not block reuse of the name (WHERE deletedAt IS NULL);
-- NULL owner semantics mean shared and personal namespaces never collide.
-- A read-only preflight collision check runs before creating the index so the
-- migration never fails on existing duplicates (the application has enforced
-- this in code since Val 1.4, so duplicates are not expected in production).

CREATE UNIQUE INDEX "response_template_shared_name_lower_key"
  ON "ResponseTemplate" (lower("name"))
  WHERE "ownerUserId" IS NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "response_template_owner_name_lower_key"
  ON "ResponseTemplate" (lower("name"), "ownerUserId")
  WHERE "ownerUserId" IS NOT NULL AND "deletedAt" IS NULL;
