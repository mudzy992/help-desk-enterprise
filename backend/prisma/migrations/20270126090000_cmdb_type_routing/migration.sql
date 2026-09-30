-- Paket 3.2 C9b: optional handler group per asset type (ticket routing by asset type).
ALTER TABLE "AssetType" ADD COLUMN "routingGroupId" TEXT;

ALTER TABLE "AssetType"
  ADD CONSTRAINT "AssetType_routingGroupId_fkey"
  FOREIGN KEY ("routingGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
