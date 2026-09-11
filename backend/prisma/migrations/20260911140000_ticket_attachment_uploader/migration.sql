-- AlterTable
ALTER TABLE "TicketAttachment" ADD COLUMN "uploadedByUserId" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "TicketAttachment" SET "uploadedByUserId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "uploadedByUserId" IS NULL AND EXISTS (SELECT 1 FROM "User");

DELETE FROM "TicketAttachment" WHERE "uploadedByUserId" IS NULL;

ALTER TABLE "TicketAttachment" ALTER COLUMN "uploadedByUserId" SET NOT NULL;

CREATE UNIQUE INDEX "TicketAttachment_storagePath_key" ON "TicketAttachment"("storagePath");
CREATE INDEX "TicketAttachment_uploadedByUserId_idx" ON "TicketAttachment"("uploadedByUserId");

ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
