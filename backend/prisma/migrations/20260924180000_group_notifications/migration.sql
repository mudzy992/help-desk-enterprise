-- Option A (2026-09-24): one notification row per group event + per-user receipts.
-- Additive: existing personal rows are untouched (userId stays set on all of them).

ALTER TABLE "Notification" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "excludedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_groupId_fkey" FOREIGN KEY ("groupId")
  REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one audience per row.
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_audience_check"
  CHECK (("userId" IS NULL) <> ("groupId" IS NULL));

CREATE UNIQUE INDEX "Notification_groupId_dedupeKey_key" ON "Notification"("groupId", "dedupeKey");
CREATE INDEX "Notification_groupId_createdAt_idx" ON "Notification"("groupId", "createdAt");

CREATE TABLE "NotificationReceipt" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationReceipt_pkey" PRIMARY KEY ("notificationId", "userId")
);
CREATE INDEX "NotificationReceipt_userId_idx" ON "NotificationReceipt"("userId");

ALTER TABLE "NotificationReceipt"
  ADD CONSTRAINT "NotificationReceipt_notificationId_fkey" FOREIGN KEY ("notificationId")
  REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationReceipt"
  ADD CONSTRAINT "NotificationReceipt_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
