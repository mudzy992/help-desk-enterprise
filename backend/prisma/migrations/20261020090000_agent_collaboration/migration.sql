-- Paket 2.4: agent collaboration (followers, mentions, related tickets).
ALTER TYPE "ParticipantRole" ADD VALUE IF NOT EXISTS 'FOLLOWER';

CREATE TABLE "TicketMessageMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketMessageMention_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketMessageMention_messageId_userId_key" ON "TicketMessageMention"("messageId", "userId");
CREATE INDEX "TicketMessageMention_userId_createdAt_idx" ON "TicketMessageMention"("userId", "createdAt");
CREATE INDEX "TicketMessageMention_ticketId_idx" ON "TicketMessageMention"("ticketId");
ALTER TABLE "TicketMessageMention" ADD CONSTRAINT "TicketMessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketMessageMention" ADD CONSTRAINT "TicketMessageMention_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketMessageMention" ADD CONSTRAINT "TicketMessageMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TicketLink" (
    "id" TEXT NOT NULL,
    "ticketAId" TEXT NOT NULL,
    "ticketBId" TEXT NOT NULL,
    "note" VARCHAR(200),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketLink_ticketAId_ticketBId_key" ON "TicketLink"("ticketAId", "ticketBId");
CREATE INDEX "TicketLink_ticketBId_idx" ON "TicketLink"("ticketBId");
ALTER TABLE "TicketLink" ADD CONSTRAINT "TicketLink_ticketAId_fkey" FOREIGN KEY ("ticketAId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketLink" ADD CONSTRAINT "TicketLink_ticketBId_fkey" FOREIGN KEY ("ticketBId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketLink" ADD CONSTRAINT "TicketLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permission ticket.link.manage (additive, idempotent) for AGENT and ADMIN;
-- SUPER_ADMIN holds every permission implicitly.
INSERT INTO "Permission" ("id", "key", "description")
VALUES (gen_random_uuid()::text, 'ticket.link.manage', 'ticket.link.manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON p."key" = 'ticket.link.manage'
WHERE r."key" IN ('AGENT', 'ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
  );

UPDATE "User" SET "authzVersion" = "authzVersion" + 1
WHERE "id" IN (
  SELECT ur."userId" FROM "UserRole" ur
  INNER JOIN "Role" r ON r."id" = ur."roleId"
  WHERE r."key" IN ('AGENT', 'ADMIN')
);
