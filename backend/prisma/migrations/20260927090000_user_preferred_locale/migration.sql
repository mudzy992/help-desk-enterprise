-- Paket 1.5: per-user language for the UI and e-mail notifications.
ALTER TABLE "User" ADD COLUMN "preferredLocale" VARCHAR(8);
