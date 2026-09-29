-- Paket 2.9 (K2b): announcement e-mail runs and the Teams post.
CREATE TYPE "AnnouncementEmailKind" AS ENUM ('PUBLISHED', 'REMINDER');

ALTER TABLE "Announcement"
  ADD COLUMN "sendEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "postToTeams" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "teamsPostedAt" TIMESTAMP(3),
  ADD COLUMN "teamsResult" VARCHAR(24);

CREATE TABLE "AnnouncementEmailRun" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "kind" "AnnouncementEmailKind" NOT NULL,
    "cursor" TEXT,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "endReason" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AnnouncementEmailRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnnouncementEmailRun_completedAt_createdAt_idx" ON "AnnouncementEmailRun"("completedAt", "createdAt");
CREATE INDEX "AnnouncementEmailRun_announcementId_idx" ON "AnnouncementEmailRun"("announcementId");

ALTER TABLE "AnnouncementEmailRun" ADD CONSTRAINT "AnnouncementEmailRun_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
