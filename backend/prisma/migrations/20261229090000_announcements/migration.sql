-- Paket 2.9 (K2): announcements with read acknowledgement, dismissals,
-- revisions of published text, and the permissions. Additive only.

CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "AnnouncementDisplayMode" AS ENUM ('BANNER', 'MODAL');
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO',
    "displayMode" "AnnouncementDisplayMode" NOT NULL DEFAULT 'BANNER',
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "notifyAudience" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "audienceRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audienceOrganizationalUnitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audienceGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceId" TEXT,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "audienceSizeAtPublish" INTEGER,
    "anonymizedAcknowledgements" INTEGER NOT NULL DEFAULT 0,
    "audienceNotifiedAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Announcement_range_check" CHECK ("endsAt" > "startsAt"),
    CONSTRAINT "Announcement_modal_check" CHECK ("displayMode" = 'BANNER' OR "requiresAcknowledgement")
);
CREATE INDEX "Announcement_status_endsAt_idx" ON "Announcement"("status", "endsAt");
CREATE INDEX "Announcement_startsAt_idx" ON "Announcement"("startsAt");
CREATE INDEX "Announcement_serviceId_idx" ON "Announcement"("serviceId");
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_publishedById_fkey"
    FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AnnouncementAcknowledgement" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementAcknowledgement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnnouncementAcknowledgement_announcementId_userId_key"
    ON "AnnouncementAcknowledgement"("announcementId", "userId");
CREATE INDEX "AnnouncementAcknowledgement_userId_idx" ON "AnnouncementAcknowledgement"("userId");
ALTER TABLE "AnnouncementAcknowledgement" ADD CONSTRAINT "AnnouncementAcknowledgement_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementAcknowledgement" ADD CONSTRAINT "AnnouncementAcknowledgement_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AnnouncementDismissal" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementDismissal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnnouncementDismissal_announcementId_userId_key"
    ON "AnnouncementDismissal"("announcementId", "userId");
CREATE INDEX "AnnouncementDismissal_userId_idx" ON "AnnouncementDismissal"("userId");
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AnnouncementRevision" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnnouncementRevision_announcementId_version_key"
    ON "AnnouncementRevision"("announcementId", "version");
ALTER TABLE "AnnouncementRevision" ADD CONSTRAINT "AnnouncementRevision_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissions: announcement.manage and announcement.report.read (ADMIN).
-- SUPER_ADMIN holds every permission implicitly; agents publish only through
-- the private.announcements.agentsMayPublish setting (own unit), not a grant.
INSERT INTO "Permission" ("id", "key", "description")
SELECT gen_random_uuid()::text, k.key, k.key
FROM (VALUES ('announcement.manage'), ('announcement.report.read')) AS k(key)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p
  ON r."key" = 'ADMIN' AND p."key" IN ('announcement.manage', 'announcement.report.read')
WHERE NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
);
