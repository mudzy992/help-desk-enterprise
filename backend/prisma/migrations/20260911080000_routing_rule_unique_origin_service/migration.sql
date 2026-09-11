-- Parent fallback is resolution-time OU walking, not a stored rule flag.
-- One persisted rule per (originUnit, service).

DELETE FROM "RoutingRule" AS duplicate
USING "RoutingRule" AS kept
WHERE duplicate."originUnitId" = kept."originUnitId"
  AND duplicate."serviceId" = kept."serviceId"
  AND duplicate."id" <> kept."id"
  AND duplicate."isFallback" = true
  AND kept."isFallback" = false;

DELETE FROM "RoutingRule" AS duplicate
USING "RoutingRule" AS kept
WHERE duplicate."originUnitId" = kept."originUnitId"
  AND duplicate."serviceId" = kept."serviceId"
  AND duplicate."id" > kept."id";

DROP INDEX "RoutingRule_originUnitId_serviceId_isFallback_key";

ALTER TABLE "RoutingRule" DROP COLUMN "isFallback";

CREATE UNIQUE INDEX "RoutingRule_originUnitId_serviceId_key" ON "RoutingRule"("originUnitId", "serviceId");
