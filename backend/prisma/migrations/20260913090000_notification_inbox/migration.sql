-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

UPDATE "Notification" SET "dedupeKey" = "id" WHERE "dedupeKey" IS NULL;

ALTER TABLE "Notification" ALTER COLUMN "dedupeKey" SET NOT NULL;

DROP INDEX "Notification_userId_isRead_idx";

CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
