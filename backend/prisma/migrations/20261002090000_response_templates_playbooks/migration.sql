-- Package 1.4: response templates and playbooks (additive).
CREATE TYPE "ResponseTemplateKind" AS ENUM ('REPLY', 'INTERNAL', 'ANY');

CREATE TABLE "ResponseTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyBs" TEXT NOT NULL,
    "bodyEn" TEXT,
    "kind" "ResponseTemplateKind" NOT NULL DEFAULT 'ANY',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ownerUserId" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResponseTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResponseTemplateService" (
    "templateId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    CONSTRAINT "ResponseTemplateService_pkey" PRIMARY KEY ("templateId","serviceId")
);

CREATE TABLE "ResponseTemplateCategory" (
    "templateId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "ResponseTemplateCategory_pkey" PRIMARY KEY ("templateId","categoryId")
);

CREATE TABLE "ResponseTemplateGroup" (
    "templateId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    CONSTRAINT "ResponseTemplateGroup_pkey" PRIMARY KEY ("templateId","groupId")
);

CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlaybookStep" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "knowledgeArticleId" TEXT,
    "responseTemplateId" TEXT,
    CONSTRAINT "PlaybookStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlaybookService" (
    "playbookId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    CONSTRAINT "PlaybookService_pkey" PRIMARY KEY ("playbookId","serviceId")
);

CREATE TABLE "PlaybookCategory" (
    "playbookId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "PlaybookCategory_pkey" PRIMARY KEY ("playbookId","categoryId")
);

CREATE TABLE "TicketPlaybook" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "playbookVersion" INTEGER NOT NULL,
    "playbookName" TEXT NOT NULL,
    "stepsSnapshot" JSONB NOT NULL,
    "attachedById" TEXT,
    "autoAttached" BOOLEAN NOT NULL DEFAULT false,
    "detachedAt" TIMESTAMP(3),
    "detachedById" TEXT,
    "detachReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketPlaybook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketPlaybookStep" (
    "id" TEXT NOT NULL,
    "ticketPlaybookId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketPlaybookStep_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TicketMessage" ADD COLUMN "responseTemplateId" TEXT;

CREATE INDEX "ResponseTemplate_ownerUserId_isActive_idx" ON "ResponseTemplate"("ownerUserId", "isActive");
CREATE INDEX "ResponseTemplate_deletedAt_isActive_idx" ON "ResponseTemplate"("deletedAt", "isActive");
CREATE INDEX "ResponseTemplateService_serviceId_idx" ON "ResponseTemplateService"("serviceId");
CREATE INDEX "ResponseTemplateCategory_categoryId_idx" ON "ResponseTemplateCategory"("categoryId");
CREATE INDEX "ResponseTemplateGroup_groupId_idx" ON "ResponseTemplateGroup"("groupId");
CREATE INDEX "Playbook_deletedAt_isActive_idx" ON "Playbook"("deletedAt", "isActive");
CREATE UNIQUE INDEX "PlaybookStep_playbookId_stepKey_key" ON "PlaybookStep"("playbookId", "stepKey");
CREATE INDEX "PlaybookStep_playbookId_position_idx" ON "PlaybookStep"("playbookId", "position");
CREATE INDEX "PlaybookService_serviceId_idx" ON "PlaybookService"("serviceId");
CREATE INDEX "PlaybookCategory_categoryId_idx" ON "PlaybookCategory"("categoryId");
CREATE INDEX "TicketPlaybook_ticketId_detachedAt_idx" ON "TicketPlaybook"("ticketId", "detachedAt");
CREATE INDEX "TicketPlaybook_playbookId_idx" ON "TicketPlaybook"("playbookId");
CREATE UNIQUE INDEX "TicketPlaybookStep_ticketPlaybookId_stepKey_key" ON "TicketPlaybookStep"("ticketPlaybookId", "stepKey");
CREATE INDEX "TicketPlaybookStep_checkedById_idx" ON "TicketPlaybookStep"("checkedById");
CREATE INDEX "TicketMessage_responseTemplateId_idx" ON "TicketMessage"("responseTemplateId");

ALTER TABLE "ResponseTemplate" ADD CONSTRAINT "ResponseTemplate_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResponseTemplateService" ADD CONSTRAINT "ResponseTemplateService_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ResponseTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResponseTemplateService" ADD CONSTRAINT "ResponseTemplateService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResponseTemplateCategory" ADD CONSTRAINT "ResponseTemplateCategory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ResponseTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResponseTemplateCategory" ADD CONSTRAINT "ResponseTemplateCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResponseTemplateGroup" ADD CONSTRAINT "ResponseTemplateGroup_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ResponseTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResponseTemplateGroup" ADD CONSTRAINT "ResponseTemplateGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookStep" ADD CONSTRAINT "PlaybookStep_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookStep" ADD CONSTRAINT "PlaybookStep_knowledgeArticleId_fkey" FOREIGN KEY ("knowledgeArticleId") REFERENCES "KnowledgeArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlaybookStep" ADD CONSTRAINT "PlaybookStep_responseTemplateId_fkey" FOREIGN KEY ("responseTemplateId") REFERENCES "ResponseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlaybookService" ADD CONSTRAINT "PlaybookService_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookService" ADD CONSTRAINT "PlaybookService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookCategory" ADD CONSTRAINT "PlaybookCategory_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookCategory" ADD CONSTRAINT "PlaybookCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketPlaybook" ADD CONSTRAINT "TicketPlaybook_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketPlaybook" ADD CONSTRAINT "TicketPlaybook_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketPlaybookStep" ADD CONSTRAINT "TicketPlaybookStep_ticketPlaybookId_fkey" FOREIGN KEY ("ticketPlaybookId") REFERENCES "TicketPlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketPlaybookStep" ADD CONSTRAINT "TicketPlaybookStep_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_responseTemplateId_fkey" FOREIGN KEY ("responseTemplateId") REFERENCES "ResponseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissions (additive, idempotent): templates for every role that can send
-- ticket messages as staff (AGENT, ADMIN); management for roles that manage
-- the service catalog (ADMIN). SUPER_ADMIN holds every permission implicitly.
INSERT INTO "Permission" ("id", "key", "description")
VALUES
  (gen_random_uuid()::text, 'ticket.templates.use', 'ticket.templates.use'),
  (gen_random_uuid()::text, 'ticket.templates.personal', 'ticket.templates.personal'),
  (gen_random_uuid()::text, 'ticket.templates.manage', 'ticket.templates.manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON p."key" IN ('ticket.templates.use', 'ticket.templates.personal')
WHERE r."key" IN ('AGENT', 'ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
  );

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, rp."roleId", tm."id"
FROM "RolePermission" rp
INNER JOIN "Permission" sc ON sc."id" = rp."permissionId" AND sc."key" = 'service.catalog.write'
INNER JOIN "Permission" tm ON tm."key" = 'ticket.templates.manage'
WHERE NOT EXISTS (
  SELECT 1 FROM "RolePermission" e WHERE e."roleId" = rp."roleId" AND e."permissionId" = tm."id"
);

-- Sessions re-read their permissions on the next request.
UPDATE "User" SET "authzVersion" = "authzVersion" + 1
WHERE "id" IN (
  SELECT ur."userId" FROM "UserRole" ur
  INNER JOIN "Role" r ON r."id" = ur."roleId"
  WHERE r."key" IN ('AGENT', 'ADMIN')
);
