-- Paket 3.1: the Teams stub (addon `teamsStub`, settings `private.integrations.teams.{stubEnabled,webhookUrl,eventTypesCsv}`,
-- job type TEAMS_STUB) is replaced by the Teams connector and removed completely.
-- Stub jobs never delivered anything, so deleting them loses no data.

DELETE FROM "IntegrationJob" WHERE "type" = 'TEAMS_STUB';

DELETE FROM "AppSetting" WHERE "key" IN (
  'private.addons.teamsStub',
  'private.integrations.teams.stubEnabled',
  'private.integrations.teams.webhookUrl',
  'private.integrations.teams.eventTypesCsv'
);

-- PostgreSQL cannot drop an enum value: recreate the type without TEAMS_STUB.
ALTER TYPE "IntegrationJobType" RENAME TO "IntegrationJobType_old";
CREATE TYPE "IntegrationJobType" AS ENUM ('EMAIL', 'EDGE_EVENT', 'TEAMS');
ALTER TABLE "IntegrationJob" ALTER COLUMN "type" TYPE "IntegrationJobType" USING ("type"::text::"IntegrationJobType");
DROP TYPE "IntegrationJobType_old";
