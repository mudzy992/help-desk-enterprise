-- Paket 3.1 (T3): Teams channel in notification preferences (null = category default).
ALTER TABLE "UserNotificationPreference" ADD COLUMN "teams" BOOLEAN;
