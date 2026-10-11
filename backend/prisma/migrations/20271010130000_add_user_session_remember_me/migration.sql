-- Paket 5.4.0-c (M4): persist whether a session uses the 30-day sliding TTL.
ALTER TABLE "UserSession" ADD COLUMN "rememberMe" BOOLEAN NOT NULL DEFAULT false;
