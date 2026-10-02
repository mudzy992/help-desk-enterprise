-- Paket 3.1: Microsoft Teams connector.
ALTER TYPE "IntegrationJobType" ADD VALUE IF NOT EXISTS 'TEAMS';
ALTER TYPE "MessageSource" ADD VALUE IF NOT EXISTS 'TEAMS';

CREATE TYPE "TeamsConversationKind" AS ENUM ('PERSONAL', 'CHANNEL', 'GROUP_CHAT');
CREATE TYPE "TeamsConnectorMode" AS ENUM ('SIMULATOR', 'LIVE');

CREATE TABLE "TeamsConversation" (
    "id" TEXT NOT NULL,
    "conversationId" VARCHAR(512) NOT NULL,
    "kind" "TeamsConversationKind" NOT NULL,
    "mode" "TeamsConnectorMode" NOT NULL,
    "tenantId" VARCHAR(64) NOT NULL,
    "serviceUrl" VARCHAR(512) NOT NULL,
    "teamId" VARCHAR(512),
    "teamName" VARCHAR(256),
    "channelId" VARCHAR(512),
    "channelName" VARCHAR(256),
    "aadObjectId" VARCHAR(64),
    "userId" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamsConversation_conversationId_key" ON "TeamsConversation"("conversationId");
CREATE INDEX "TeamsConversation_userId_removedAt_idx" ON "TeamsConversation"("userId", "removedAt");
CREATE INDEX "TeamsConversation_kind_removedAt_idx" ON "TeamsConversation"("kind", "removedAt");
CREATE INDEX "TeamsConversation_aadObjectId_idx" ON "TeamsConversation"("aadObjectId");
ALTER TABLE "TeamsConversation" ADD CONSTRAINT "TeamsConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TeamsGroupChannel" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "teamsConversationId" TEXT NOT NULL,
    "events" TEXT[],
    "includeTitle" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsGroupChannel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamsGroupChannel_groupId_key" ON "TeamsGroupChannel"("groupId");
CREATE INDEX "TeamsGroupChannel_teamsConversationId_idx" ON "TeamsGroupChannel"("teamsConversationId");
ALTER TABLE "TeamsGroupChannel" ADD CONSTRAINT "TeamsGroupChannel_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamsGroupChannel" ADD CONSTRAINT "TeamsGroupChannel_teamsConversationId_fkey" FOREIGN KEY ("teamsConversationId") REFERENCES "TeamsConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeamsCardMessage" (
    "id" TEXT NOT NULL,
    "teamsConversationId" TEXT NOT NULL,
    "activityId" VARCHAR(512) NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "cardKind" VARCHAR(60) NOT NULL,
    "stateHash" VARCHAR(64) NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsCardMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamsCardMessage_teamsConversationId_entityType_entityId_cardKind_key" ON "TeamsCardMessage"("teamsConversationId", "entityType", "entityId", "cardKind");
CREATE INDEX "TeamsCardMessage_entityType_entityId_idx" ON "TeamsCardMessage"("entityType", "entityId");
CREATE INDEX "TeamsCardMessage_createdAt_idx" ON "TeamsCardMessage"("createdAt");
ALTER TABLE "TeamsCardMessage" ADD CONSTRAINT "TeamsCardMessage_teamsConversationId_fkey" FOREIGN KEY ("teamsConversationId") REFERENCES "TeamsConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeamsInboundActivity" (
    "activityId" VARCHAR(512) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamsInboundActivity_pkey" PRIMARY KEY ("activityId")
);
CREATE INDEX "TeamsInboundActivity_receivedAt_idx" ON "TeamsInboundActivity"("receivedAt");

-- Permission (decision 2026-10-02): ADMIN manages the connector.
INSERT INTO "Permission" ("id", "key", "description")
VALUES (gen_random_uuid()::text, 'integrations.teams.manage', 'integrations.teams.manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON p."key" = 'integrations.teams.manage'
WHERE r."key" = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id");
