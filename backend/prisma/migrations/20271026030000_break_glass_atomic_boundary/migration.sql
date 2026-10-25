ALTER TABLE "BreakGlassEvent" ADD COLUMN "correlationId" UUID;

UPDATE "BreakGlassEvent"
SET "correlationId" = md5('break-glass:' || "id")::uuid
WHERE "correlationId" IS NULL;

ALTER TABLE "BreakGlassEvent" ALTER COLUMN "correlationId" SET NOT NULL;
CREATE UNIQUE INDEX "BreakGlassEvent_correlationId_key" ON "BreakGlassEvent"("correlationId");
