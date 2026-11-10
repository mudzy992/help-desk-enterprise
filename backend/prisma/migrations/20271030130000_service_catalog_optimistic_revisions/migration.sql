-- BA-service-catalog-09: additive revision counters for service/category
-- optimistic concurrency. Existing rows start at revision 1; no data rewrite
-- or live-target migration is performed by this file.
BEGIN;

ALTER TABLE "Service"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "Service_revision_positive_check" CHECK ("revision" > 0);

ALTER TABLE "ServiceCategory"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "ServiceCategory_revision_positive_check" CHECK ("revision" > 0);

COMMIT;
