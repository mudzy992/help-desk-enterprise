-- AlterTable
ALTER TABLE "ManualDirectoryOrganizationalUnit" ADD COLUMN "type" "OrganizationalUnitType" NOT NULL DEFAULT 'BRANCH';

-- Backfill roots as DIRECTORATE
UPDATE "ManualDirectoryOrganizationalUnit"
SET "type" = 'DIRECTORATE'
WHERE "parentExternalId" IS NULL;