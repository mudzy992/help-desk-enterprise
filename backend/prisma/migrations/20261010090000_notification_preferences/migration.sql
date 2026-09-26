-- Paket 2.2: personal notification preferences, quiet hours, daily digest.
CREATE TABLE "UserNotificationPreference" (
    "userId" TEXT NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "inApp" BOOLEAN,
    "email" VARCHAR(16),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("userId","category")
);
CREATE INDEX "UserNotificationPreference_category_inApp_idx" ON "UserNotificationPreference"("category", "inApp");
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserNotificationSchedule" (
    "userId" TEXT NOT NULL,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietStartMinute" INTEGER NOT NULL DEFAULT 1080,
    "quietEndMinute" INTEGER NOT NULL DEFAULT 420,
    "quietWeekends" BOOLEAN NOT NULL DEFAULT false,
    "digestMinute" INTEGER,
    "digestWorkdaysOnly" BOOLEAN NOT NULL DEFAULT true,
    "lastDigestSentAt" TIMESTAMP(3),
    "lastQuietFlushAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserNotificationSchedule_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "UserNotificationSchedule" ADD CONSTRAINT "UserNotificationSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationDigestItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(8) NOT NULL,
    "ticketId" TEXT,
    "event" VARCHAR(64) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDigestItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationDigestItem_userId_dedupeKey_key" ON "NotificationDigestItem"("userId", "dedupeKey");
CREATE INDEX "NotificationDigestItem_userId_createdAt_idx" ON "NotificationDigestItem"("userId", "createdAt");
CREATE INDEX "NotificationDigestItem_createdAt_idx" ON "NotificationDigestItem"("createdAt");
ALTER TABLE "NotificationDigestItem" ADD CONSTRAINT "NotificationDigestItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDigestItem" ADD CONSTRAINT "NotificationDigestItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
