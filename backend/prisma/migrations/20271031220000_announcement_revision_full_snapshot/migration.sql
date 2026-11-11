-- BA-announcements-07: a published revision kept only title/body, so severity,
-- display, schedule, service and channel changes had no immutable history.
-- Add nullable snapshot columns; revisions written earlier stay readable
-- with NULL snapshot fields. Add-only: no existing data is changed.
ALTER TABLE "AnnouncementRevision" ADD COLUMN "severity" "AnnouncementSeverity";
ALTER TABLE "AnnouncementRevision" ADD COLUMN "displayMode" "AnnouncementDisplayMode";
ALTER TABLE "AnnouncementRevision" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "AnnouncementRevision" ADD COLUMN "endsAt" TIMESTAMP(3);
ALTER TABLE "AnnouncementRevision" ADD COLUMN "serviceId" TEXT;
ALTER TABLE "AnnouncementRevision" ADD COLUMN "notifyAudience" BOOLEAN;
ALTER TABLE "AnnouncementRevision" ADD COLUMN "sendEmail" BOOLEAN;
ALTER TABLE "AnnouncementRevision" ADD COLUMN "postToTeams" BOOLEAN;
