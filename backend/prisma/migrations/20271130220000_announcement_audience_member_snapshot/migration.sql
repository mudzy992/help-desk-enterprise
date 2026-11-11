-- BA-announcements-13: the report mixed the publish-time audience size with the
-- live audience and all historical acknowledgements. Capture an immutable
-- membership snapshot inside the publish transaction instead. Add-only: one
-- new table, no existing data is changed; announcements published earlier
-- simply have no snapshot rows.
CREATE TABLE "AnnouncementAudienceMember" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationalUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementAudienceMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnnouncementAudienceMember_announcementId_userId_key" ON "AnnouncementAudienceMember"("announcementId", "userId");

CREATE INDEX "AnnouncementAudienceMember_announcementId_organizationalUnitId_idx" ON "AnnouncementAudienceMember"("announcementId", "organizationalUnitId");

CREATE INDEX "AnnouncementAudienceMember_userId_idx" ON "AnnouncementAudienceMember"("userId");

ALTER TABLE "AnnouncementAudienceMember" ADD CONSTRAINT "AnnouncementAudienceMember_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
