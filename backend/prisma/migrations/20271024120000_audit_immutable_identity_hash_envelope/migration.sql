-- Audit identity is historical evidence, not a live referential relation.
-- Preserve actor/OU identifiers when their source row is hard-deleted.
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorUserId_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_organizationalUnitId_fkey";

-- Legacy rows were written with the historical default unless their v3
-- envelope states otherwise. Every new row persists and hashes its algorithm.
ALTER TABLE "AuditLog" ADD COLUMN "hashAlgorithm" TEXT NOT NULL DEFAULT 'sha256';
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_hashAlgorithm_check"
  CHECK ("hashAlgorithm" IN ('sha256', 'sha384', 'sha512'));
